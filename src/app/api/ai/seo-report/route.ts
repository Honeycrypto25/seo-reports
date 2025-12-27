import OpenAI from "openai";
import { NextResponse } from "next/server";

/**
 * POST /api/ai/seo-report
 * Body:
 * {
 *   "site": "dentequip.ro",
 *   "month": "2025-11",
 *   "google": { current, previous, yoy, last16Months },
 *   "bing":   { current, previous, yoy, last16Months? }
 * }
 *
 * Each period object:
 * { clicks: number, impressions: number, ctr: number, position?: number | null }
 *
 * last16Months: [{ month: "2024-08", clicks, impressions, ctr, position? }, ...] (up to 16)
 */

type PeriodMetrics = {
    clicks: number;
    impressions: number;
    ctr: number; // percentage, e.g. 5 means 5%
    position?: number | null; // lower is better; can be null if not available
};

type MonthPoint = PeriodMetrics & {
    month: string; // YYYY-MM
};

type SourcePayload = {
    current: PeriodMetrics;
    previous?: PeriodMetrics | null;
    yoy?: PeriodMetrics | null;
    last16Months?: MonthPoint[] | null;
};

type RequestBody = {
    site: string;
    month: string; // YYYY-MM
    google: SourcePayload;
    bing?: SourcePayload | null;
};

function isFiniteNumber(v: any) {
    return typeof v === "number" && Number.isFinite(v);
}

function validatePeriod(p: any, allowPosition = true) {
    if (!p || typeof p !== "object") return false;
    if (!isFiniteNumber(p.clicks)) return false;
    if (!isFiniteNumber(p.impressions)) return false;
    if (!isFiniteNumber(p.ctr)) return false;
    if (allowPosition && p.position !== undefined && p.position !== null && !isFiniteNumber(p.position)) return false;
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

    const ctrDeltaPP = current.ctr - previous.ctr; // percentage points
    const posDelta = (current.position ?? null) !== null && (previous.position ?? null) !== null
        ? (previous.position as number) - (current.position as number) // positive = improvement (went lower)
        : null;

    return {
        clicks_delta_abs: current.clicks - previous.clicks,
        clicks_delta_pct: clicksPct,
        impressions_delta_abs: current.impressions - previous.impressions,
        impressions_delta_pct: impressionsPct,
        ctr_delta_pp: ctrDeltaPP,
        position_improvement: posDelta, // positive is good
    };
}

function compactNumber(n: number) {
    // Simple compact formatting for readability, e.g. 48400 -> "48.4K"
    if (!Number.isFinite(n)) return String(n);
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return `${n}`;
}

function round2(n: number | null) {
    if (n === null || n === undefined || !Number.isFinite(n)) return null;
    return Math.round(n * 100) / 100;
}

function normalizeSeries(series?: MonthPoint[] | null) {
    if (!Array.isArray(series)) return [];
    // keep only valid points, sort by month asc
    return series
        .filter((x) => x && typeof x === "object" && typeof x.month === "string" && validatePeriod(x))
        .sort((a, b) => a.month.localeCompare(b.month))
        .slice(-16);
}

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
    try {
        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json({ error: "Missing OPENAI_API_KEY on server." }, { status: 500 });
        }

        const body = (await req.json()) as RequestBody;

        if (!body?.site || typeof body.site !== "string") {
            return NextResponse.json({ error: "Invalid 'site'." }, { status: 400 });
        }
        if (!body?.month || typeof body.month !== "string") {
            return NextResponse.json({ error: "Invalid 'month' (expected YYYY-MM)." }, { status: 400 });
        }

        if (!body.google || typeof body.google !== "object" || !validatePeriod(body.google.current)) {
            return NextResponse.json({ error: "Invalid 'google.current' metrics." }, { status: 400 });
        }

        if (body.google.previous && !validatePeriod(body.google.previous)) {
            return NextResponse.json({ error: "Invalid 'google.previous' metrics." }, { status: 400 });
        }
        if (body.google.yoy && !validatePeriod(body.google.yoy)) {
            return NextResponse.json({ error: "Invalid 'google.yoy' metrics." }, { status: 400 });
        }

        const bing = body.bing ?? null;
        if (bing?.current && !validatePeriod(bing.current, true)) {
            return NextResponse.json({ error: "Invalid 'bing.current' metrics." }, { status: 400 });
        }
        if (bing?.previous && !validatePeriod(bing.previous, true)) {
            return NextResponse.json({ error: "Invalid 'bing.previous' metrics." }, { status: 400 });
        }
        if (bing?.yoy && !validatePeriod(bing.yoy, true)) {
            return NextResponse.json({ error: "Invalid 'bing.yoy' metrics." }, { status: 400 });
        }

        // Build deltas server-side so AI doesn’t do math guessing
        const gMoM = buildDeltas(body.google.current, body.google.previous ?? null);
        const gYoY = buildDeltas(body.google.current, body.google.yoy ?? null);

        const bMoM = bing?.current ? buildDeltas(bing.current, bing.previous ?? null) : null;
        const bYoY = bing?.current ? buildDeltas(bing.current, bing.yoy ?? null) : null;

        const gSeries = normalizeSeries(body.google.last16Months ?? null);
        const bSeries = normalizeSeries(bing?.last16Months ?? null);

        // Prepare a structured pack for the model
        const pack = {
            site: body.site,
            month: body.month,
            google: {
                current: body.google.current,
                previous: body.google.previous ?? null,
                yoy: body.google.yoy ?? null,
                deltas: {
                    mom: gMoM,
                    yoy: gYoY,
                },
                last16Months: gSeries,
            },
            bing: bing?.current
                ? {
                    current: bing.current,
                    previous: bing.previous ?? null,
                    yoy: bing.yoy ?? null,
                    deltas: {
                        mom: bMoM,
                        yoy: bYoY,
                    },
                    last16Months: bSeries,
                }
                : null,
        };

        /**
         * Prompt design:
         * - Romanian output
         * - Focus on positives (strengths)
         * - Use the provided deltas (do not recompute)
         * - Mention MoM + YoY + 16-month trend
         * - Avoid inventing data; if something is missing, say “nu avem date”
         */
        const instructions = `
Ești un specialist SEO care scrie un raport lunar profesionist în limba română.
Sarcina ta: analizează datele SEO furnizate (Google Search Console + Bing) și scoate în evidență PUNCTELE FORTE ale lunii.

Reguli:
- Nu inventa date. Folosește strict valorile din pachetul JSON.
- Nu recalcula matematica dacă ai deja "deltas". Folosește deltas.
- Ton: pozitiv, clar, orientat către client. Fără jargon inutil.
- Dacă lipsesc date pentru Bing sau YoY/MoM, menționează scurt “nu avem date pentru comparația X”.
- Poziția medie: o scădere a valorii = îmbunătățire (mai bine). Când ai "position_improvement" pozitiv => e un plus.

Vreau să includi:
1) Highlights (4–6 bullet points) – cele mai puternice aspecte pozitive.
2) Secțiune Google: rezultate luna curentă + comparație MoM + YoY (dacă există).
3) Secțiune Bing: rezultate luna curentă + comparație MoM + YoY (dacă există).
4) Trend 16 luni: 2–4 propoziții despre evoluție (dacă există serie). Dacă nu, spune “nu avem încă date pe 16 luni”.
5) Concluzie finală scurtă (2–3 propoziții).

Formatare output:
- Returnează JSON valid cu cheile:
  - "highlights": string[] 
  - "google_section": string
  - "bing_section": string
  - "trend_summary": string
  - "final_summary": string
`.trim();

        // Note: The user provided client.responses.create which might be for a different SDK version.
        // I will use chat.completions.create which is the standard for gpt models in the 'openai' package.
        const response = await client.chat.completions.create({
            model: "gpt-5-mini",
            messages: [
                { role: "system", content: instructions },
                {
                    role: "user",
                    content: `Date SEO (JSON):\n${JSON.stringify(pack, null, 2)}`,
                },
            ],
            temperature: 0.3,
            response_format: { type: "json_object" }
        });

        const text = response.choices[0].message.content?.trim() || "{}";

        // Try to parse JSON output; if model returns non-JSON, fallback to raw text
        let parsed: any = null;
        try {
            parsed = JSON.parse(text);
        } catch {
            parsed = null;
        }

        if (!parsed || typeof parsed !== "object") {
            return NextResponse.json(
                {
                    ok: true,
                    mode: "raw",
                    report: {
                        text,
                        pack,
                    },
                },
                { status: 200 }
            );
        }

        // minimal shape check
        const report = {
            highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
            google_section: typeof parsed.google_section === "string" ? parsed.google_section : "",
            bing_section: typeof parsed.bing_section === "string" ? parsed.bing_section : "",
            trend_summary: typeof parsed.trend_summary === "string" ? parsed.trend_summary : "",
            final_summary: typeof parsed.final_summary === "string" ? parsed.final_summary : "",
        };

        return NextResponse.json(
            {
                ok: true,
                mode: "json",
                report,
                // optional: include a compact summary for UI cards
                summary_cards: {
                    google: {
                        clicks: compactNumber(pack.google.current.clicks),
                        impressions: compactNumber(pack.google.current.impressions),
                        ctr: `${round2(pack.google.current.ctr)}%`,
                        position:
                            pack.google.current.position !== null && pack.google.current.position !== undefined
                                ? round2(pack.google.current.position)
                                : null,
                    },
                    bing: pack.bing?.current
                        ? {
                            clicks: compactNumber(pack.bing.current.clicks),
                            impressions: compactNumber(pack.bing.current.impressions),
                            ctr: `${round2(pack.bing.current.ctr)}%`,
                            position:
                                pack.bing.current.position !== null && pack.bing.current.position !== undefined
                                    ? round2(pack.bing.current.position)
                                    : null,
                        }
                        : null,
                },
            },
            { status: 200 }
        );
    } catch (err: any) {
        console.error("AI SEO Report Error:", err);
        return NextResponse.json(
            {
                error: "Failed to generate SEO report.",
                details: err?.message ?? String(err),
            },
            { status: 500 }
        );
    }
}
