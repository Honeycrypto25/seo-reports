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
    // We keep bing_status for backward compatibility/explicit instructions if needed
    bing_status?: string;
};

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

function isFiniteNumber(v: any) {
    return typeof v === "number" && Number.isFinite(v);
}

function validatePeriod(p: any) {
    if (!p || typeof p !== "object") return false;
    // Allow 0 values, but check type
    if (p.clicks === undefined || !isFiniteNumber(p.clicks)) return false;
    if (p.impressions === undefined || !isFiniteNumber(p.impressions)) return false;
    // ctr and position might be calculated later or passed
    return true;
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

export async function POST(req: Request) {
    try {
        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json({ error: "Missing OPENAI_API_KEY on server." }, { status: 500 });
        }

        const body = (await req.json()) as RequestBody;

        // Basic validation
        if (!body?.site || typeof body.site !== "string") {
            // Fallback or error? Let's be lenient for manual testing but strict for prod
        }

        // Pre-calc deltas so model doesn’t guess math
        // Ensure we handle potentially missing optional fields gracefully
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

        // Pack for the model (single source of truth)
        const pack = {
            site: body.site,
            periodLabel: body.periodLabel || "Curent",
            google: {
                current: googleCurrent,
                previous: googlePrev,
                yoy: googleYoy,
                deltas: {
                    mom: googleMoM,
                    yoy: googleYoY,
                },
            },
            bing: bingCurrent
                ? {
                    current: bingCurrent,
                    previous: bingPrev,
                    yoy: bingYoy,
                    deltas: {
                        mom: bingMoM,
                        yoy: bingYoY,
                    },
                    status: body.bing_status
                }
                : { status: body.bing_status || 'not_connected' },
            last16Months: Array.isArray(body.last16Months) ? body.last16Months.slice(-16) : null,
        };

        const SYSTEM_PROMPT = `
Ești un specialist SEO care redactează un raport profesional de performanță organică,
destinat unui client final.

REGULI:
- Nu menționa AI, algoritmi sau termeni tehnici inutili.
- Nu inventa date. Folosește STRICT datele primite în JSON.
- Nu recalcula valori dacă ai deja deltas (MoM / YoY) în "deltas".
- Ton profesional, clar, orientat spre rezultate. Fără exagerări.

INTERPRETARE:
- Poziție medie MAI MICĂ = clasare MAI BUNĂ.
  Folosește „poziția medie s-a îmbunătățit” / „clasare mai bună”, nu „poziția a crescut”.
- Dacă impresiile scad dar click-urile sau CTR cresc,
  explică acest lucru ca o creștere a calității traficului.
- Specifică mereu contextul comparațiilor: lună curentă vs luna anterioară (MoM) și vs aceeași lună a anului trecut (YoY).

CERINȚĂ NOUĂ (OBLIGATORIU):
- Generează un tabel Markdown cu indicatorii Google pentru:
  * Luna raportului (current) vs luna anterioară (previous)
  În tabel să apară rânduri pentru: Click-uri, Impresii, CTR, Poziție medie.
  Coloane: Indicator | Luna raportului | Luna anterioară | Diferență (abs) | Diferență (pct/pp) | Observație
  Folosește datele din "deltas.mom" pentru precizie. Formatează procentele cu 2 zecimale.
  La "Observație" pune un scurt comentariu (ex: "Creștere solidă", "Scădere ușoară", "Stabil").

OUTPUT OBLIGATORIU – JSON VALID (fără markdown în afară de tabel):
{
  "title": string,
  "highlights": string[],
  "mom_table_markdown": string,
  "google_section": string,
  "bing_section": string,
  "trend_16_months": string,
  "executive_conclusion": string
}

CONȚINUT:
1) title: un titlu profesionist (fără AI), ex: "Performanță SEO & Analiză Trafic Organic"
2) highlights: 4–6 bullet points (pozitive, credibile, bazate pe date)
3) mom_table_markdown: tabelul Google (current vs previous) descris mai sus
4) google_section: text narativ cu rezultate + comparație MoM + YoY (dacă există)
5) bing_section: la fel, iar dacă lipsesc date, o formulare elegantă (vezi bing.status)
6) trend_16_months: 2–4 propoziții pe baza last16Months; identifică trendul general
7) executive_conclusion: 2–3 propoziții, executive, orientate pe progres

Returnează EXCLUSIV JSON valid.
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
            return NextResponse.json(
                { error: "Model output is not valid JSON.", raw: outputText },
                { status: 500 }
            );
        }

        // Minimal shape normalization (so UI doesn’t crash)
        const report = {
            title: typeof parsed.title === "string" ? parsed.title : "Performanță SEO & Analiză Trafic Organic",
            highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
            mom_table_markdown: typeof parsed.mom_table_markdown === "string" ? parsed.mom_table_markdown : "",
            google_section: typeof parsed.google_section === "string" ? parsed.google_section : "",
            bing_section: typeof parsed.bing_section === "string" ? parsed.bing_section : "",
            trend_16_months: typeof parsed.trend_16_months === "string" ? parsed.trend_16_months : "",
            executive_conclusion: typeof parsed.executive_conclusion === "string" ? parsed.executive_conclusion : "",
        };

        return NextResponse.json({
            success: true,
            report,
        });
    } catch (error: any) {
        console.error("AI Generation Error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error?.message || "Unexpected error",
            },
            { status: 500 }
        );
    }
}
