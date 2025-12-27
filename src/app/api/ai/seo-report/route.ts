import OpenAI from "openai";
import { NextResponse } from "next/server";

type PeriodMetrics = {
    clicks: number;
    impressions: number;
    ctr: number; // e.g. 4.96 (percent)
    position?: number | null; // lower is better
};

type RequestBody = {
    site: string;
    periodLabel: string; // e.g. "Noiembrie 2025"
    google: {
        current: PeriodMetrics;
        previous?: PeriodMetrics | null; // luna anterioara
        yoy?: PeriodMetrics | null; // optional: same month last year
    };
    bing?: {
        current?: PeriodMetrics | null;
        previous?: PeriodMetrics | null;
        yoy?: PeriodMetrics | null;
    } | null;
    last16Months?: Array<{
        month: string; // YYYY-MM
        clicks: number;
        impressions: number;
        ctr: number;
        position?: number | null;
    }> | null;
    bing_status?: string;
};

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

function isFiniteNumber(v: any) {
    return typeof v === "number" && Number.isFinite(v);
}

function safeDeltaPct(current: number, previous: number) {
    if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
    return ((current - previous) / previous) * 100;
}

function buildDeltas(current: PeriodMetrics, previous?: PeriodMetrics | null) {
    if (!previous) return null;

    const clicksPct = safeDeltaPct(current.clicks, previous.clicks);
    const impressionsPct = safeDeltaPct(current.impressions, previous.impressions);
    const ctrDeltaPP = current.ctr - previous.ctr;

    const curPos = current.position ?? null;
    const prevPos = previous.position ?? null;

    // positive value = improvement (position got smaller)
    const positionImprovement =
        curPos !== null && prevPos !== null ? prevPos - curPos : null;

    return {
        clicks_delta_abs: current.clicks - previous.clicks,
        clicks_delta_pct: clicksPct,
        impressions_delta_abs: current.impressions - previous.impressions,
        impressions_delta_pct: impressionsPct,
        ctr_delta_pp: ctrDeltaPP,
        position_improvement: positionImprovement,
    };
}

function getPreviousMonthLabel(currentLabel: string) {
    // Tries to parse YYYY-MM and return previous month label in Romanian
    // If not parseable, returns "Luna Anterioară"
    try {
        const [y, m] = currentLabel.split('-').map(Number);
        if (y && m) {
            let prevM = m - 1;
            let prevY = y;
            if (prevM < 1) { prevM = 12; prevY -= 1; }
            // Simple mapping
            const months = ["IAN", "FEB", "MAR", "APR", "MAI", "IUN", "IUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
            const currName = months[m - 1] || "Current";
            const prevName = months[prevM - 1] || "Previous";
            return `${prevName} ${prevY}`;
        }
    } catch (e) { }
    return "Luna Anterioară";
}

function formatCurrentLabel(currentLabel: string) {
    try {
        const [y, m] = currentLabel.split('-').map(Number);
        if (y && m) {
            const months = ["IAN", "FEB", "MAR", "APR", "MAI", "IUN", "IUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
            return `${months[m - 1]} ${y}`;
        }
    } catch (e) { }
    return currentLabel;
}

export async function POST(req: Request) {
    try {
        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json({ error: "Missing OPENAI_API_KEY on server." }, { status: 500 });
        }

        const body = (await req.json()) as RequestBody;

        // Ensure we supply defaults
        const googleCurrent = body.google?.current || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
        const googlePrev = body.google?.previous || null;
        const googleYoy = body.google?.yoy || null;

        const googleMoM = buildDeltas(googleCurrent, googlePrev);
        const googleYoY = buildDeltas(googleCurrent, googleYoy);

        const bingCurrent = body.bing?.current || null;
        const bingPrev = body.bing?.previous || null;
        const bingYoy = body.bing?.yoy || null;

        const bingMoM = bingCurrent ? buildDeltas(bingCurrent, bingPrev) : null;
        const bingYoY = bingCurrent ? buildDeltas(bingCurrent, bingYoy) : null;

        // Labels
        const labelCurr = formatCurrentLabel(body.periodLabel || "2025-01");
        const labelPrev = getPreviousMonthLabel(body.periodLabel || "2025-01");

        // Pack for the model
        const pack = {
            site: body.site,
            periodLabel: body.periodLabel || "Curent",
            labels: {
                current: labelCurr,
                previous: labelPrev
            },
            google: {
                current: googleCurrent,
                previous: googlePrev,
                yoy: googleYoy,
                deltas: { mom: googleMoM, yoy: googleYoY },
            },
            bing: bingCurrent
                ? {
                    current: bingCurrent,
                    previous: bingPrev,
                    yoy: bingYoy,
                    deltas: { mom: bingMoM, yoy: bingYoY },
                    status: body.bing_status
                }
                : { status: body.bing_status || 'not_connected' },
            last16Months: Array.isArray(body.last16Months) ? body.last16Months.slice(-16) : null,
        };

        const SYSTEM_PROMPT = `
Ești un specialist SEO care redactează un raport profesional de performanță organică.

REGULI:
- Ton profesional, clar, orientat spre rezultate.
- Poziție medie mică = clasare mai bună.
- Impresii scăzute cu CTR crescut = calitate mai bună a traficului.

TABELE COMPARATIVE (Markdown):
Generează 2 tabele separate.
Titlurile coloanelor trebuie să fie EXACT: "Indicator", "${labelCurr}", "${labelPrev}", "Diferență (Abs)", "Diferență (%)", "Observație".

1. TABEL GOOGLE (cheie JSON: "google_table")
   - Rânduri: Click-uri, Impresii, CTR, Poziție medie.
   - Date din google.deltas.mom.

2. TABEL BING (cheie JSON: "bing_table")
   - Doar dacă Bing este conectat ("status" != "no_data_or_error" și "status" != "not_connected").
   - Aceeași structură. Dacă nu, returnează string gol "".

OUTPUT OBLIGATORIU – JSON VALID:
{
  "title": string,
  "highlights": string[],
  "google_table": string,
  "bing_table": string,
  "google_section": string,
  "bing_section": string,
  "trend_16_months": string,
  "executive_conclusion": string
}
`.trim();

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.3,
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: `Date SEO (JSON):\n${JSON.stringify(pack, null, 2)}` },
            ],
        });

        const outputText = response.choices[0].message.content?.trim();
        if (!outputText) throw new Error("Empty AI response");

        let parsed: any;
        try {
            const cleanJson = outputText.replace(/```json\n|\n```/g, "").trim();
            parsed = JSON.parse(cleanJson);
        } catch {
            return NextResponse.json({ error: "Model output is not valid JSON.", raw: outputText }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            report: {
                title: parsed.title || "Raport SEO",
                highlights: parsed.highlights || [],
                google_table: parsed.google_table || parsed.mom_table_markdown || "",
                bing_table: parsed.bing_table || "",
                google_section: parsed.google_section || "",
                bing_section: parsed.bing_section || "",
                trend_16_months: parsed.trend_16_months || "",
                executive_conclusion: parsed.executive_conclusion || ""
            },
        });
    } catch (error: any) {
        console.error("AI Generation Error:", error);
        return NextResponse.json({ success: false, error: error?.message || "Error" }, { status: 500 });
    }
}
