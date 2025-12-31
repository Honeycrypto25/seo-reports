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
    topKeywords?: Array<{
        rank: number;
        keyword: string;
        clicks: number;
        impressions: number;
        ctr: number;
        position: number;
    }> | null;
};

// ... (helpers remain same)

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
        const labelYoY = getYoYMonthLabel(body.periodLabel || "2025-01");

        // Pack for the model
        const pack = {
            site: body.site,
            periodLabel: labelCurr,
            labels: {
                current: labelCurr,
                previous: labelPrev,
                yoy: labelYoY
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
            topKeywords: body.topKeywords || []
        };

        const SYSTEM_PROMPT = `
Ești un specialist SEO senior care redactează un RAPORT LUNAR DE PERFORMANȚĂ strict structurat.
Trebuie să returnezi un JSON cu secțiuni markdown gata de afișat, respectând EXACT structura cerută.

DATELE TALE SUNT:
${JSON.stringify(pack, null, 2)}

STRUCTURA RAPORTULUI (Returnează JSON cu aceste chei):

1. "seo_actions" (Markdown):
   - Titlu: "2️⃣ Acțiuni SEO Realizate în ${labelCurr}"
   - Listează 5-6 acțiuni SEO plauzibile și profesionale de "maintenance" și "optimizare" (ex: optimizare meta tags, verificare core web vitals, indexare articole noi, consolidare linkuri interne). Fii specific dar general valabil.

2. "bing_section" (Markdown):
   - Titlu: "3️⃣ Rezultate Yahoo/Bing – ${labelCurr}"
   - Subtitlu: "🔵 Date generale – ${labelCurr}:" -> Listează Clickuri, Impresii, CTR.
   - Subtitlu: "🔵 ${labelCurr} vs ${labelPrev}:"
   - TABEL Markdown cu coloane: Indicator | ${labelPrev} | ${labelCurr} | Diferență.
     - Liniile: Clickuri, Impresii, CTR.
     - La diferență folosește emoji (🔼/🔽/≈) și procentele calculate.
   - Comentariu scurt cu emoji 📌 despre trend.
   - Dacă nu sunt date Bing, scrie un mesaj politicos "Nu există date disponibile".

3. "google_section" (Markdown):
   - Titlu: "4️⃣ Rezultate Google – ${labelCurr}"
   - Subtitlu: "🔵 ${labelCurr} – Performanță:" -> Listează Clickuri, Impresii, CTR, Poziție medie.
   - Comentariu scurt 📌.
   - Subtitlu: "4.1 Google – ${labelCurr} vs ${labelPrev}"
   - TABEL Markdown (Indicator, ${labelPrev}, ${labelCurr}, Diferență).
   - Comentariu scurt 📌.
   - Subtitlu: "4.2 Google – ${labelCurr} vs ${labelYoY}" (Dacă există date YoY)
   - TABEL Markdown (Indicator, ${labelYoY}, ${labelCurr}, Evoluție).
   - Comentariu scurt 📌.

4. "organic_evolution" (Markdown):
   - Titlu: "5️⃣ Evoluția Organică Google – Ultimele 16 luni"
   - Analizează scurt trendul din ultimele 16 luni (crescător/descrescător/stabil).
   - Menționează stabilitatea pozițiilor.

5. "top_keywords" (Markdown):
   - Titlu: "6️⃣ Top 50 Cuvinte Cheie – ${labelCurr}"
   - Mesaj: "📌 Toate cele 50 sunt incluse integral."
   - TABEL Markdown complet cu coloanele: # | Cuvânt cheie | Clickuri | Impresii | CTR | Poziție.
   - Listează TOATE cele 50 de cuvinte cheie din "topKeywords" dacă există.
   - Formatează CTR cu %.

6. "conclusions" (Markdown):
   - Titlu: "7️⃣ Concluzii Finale"
   - Listă cu puncte cheie (✔) despre creșteri, stabilitate, oportunități.
   - Mesaj final de încheiere pozitiv.

OBSERVAȚII:
- Folosește emoji-urile din exemplu (🔹, 🔵, 📌, 🔼, 🔽, ✔).
- Fii concis și profesionist.
- Formatează numerele mari cu "K" (ex: 13.2K) unde e cazul, sau întregi cu separator.

OUTPUT JSON OBLIGATORIU:
{
  "seo_actions": string,
  "bing_section": string,
  "google_section": string,
  "organic_evolution": string,
  "top_keywords": string,
  "conclusions": string
}
`.trim();

        const response = await openai.chat.completions.create({
            model: "gpt-4o", // Using generic GPT-4o model
            temperature: 0.3,
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: `Generează raportul pentru ${body.site}.` },
            ],
            response_format: { type: "json_object" }
        });

        const outputText = response.choices[0].message.content?.trim();
        if (!outputText) throw new Error("Empty AI response");

        let parsed: any;
        try {
            parsed = JSON.parse(outputText);
        } catch {
            return NextResponse.json({ error: "Model output is not valid JSON.", raw: outputText }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            report: parsed
        });
    } catch (error: any) {
        console.error("AI Generation Error:", error);
        return NextResponse.json({ success: false, error: error?.message || "Error" }, { status: 500 });
    }
}
