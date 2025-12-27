import OpenAI from "openai";
import { NextResponse } from "next/server";

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const SYSTEM_PROMPT = `
Ești un specialist SEO care redactează un raport profesional de performanță organică,
destinat unui client final în limba română.

REGULI:
- Nu menționa AI, algoritmi sau termeni tehnici inutili.
- Nu inventa date. Folosește STRICT datele primite în body.
- Nu recalcula valori deja existente.
- Ton profesional, clar, orientat spre rezultate.

INTERPRETARE:
- Poziție medie MAI MICĂ = clasare MAI BUNĂ.
  Folosește „poziția s-a îmbunătățit”, nu „a crescut”.
- Dacă impresiile scad dar click-urile sau CTR cresc,
  explică acest lucru ca o creștere a calității traficului.
- Specifică clar contextul comparațiilor (MoM / YoY).

OUTPUT OBLIGATORIU – JSON VALID:
{
  "highlights": string[],
  "google_section": string,
  "bing_section": string,
  "trend_16_months": string,
  "executive_conclusion": string
}
`.trim();

        const response = await client.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.3,
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                {
                    role: "user",
                    content: `Date SEO (JSON):\n${JSON.stringify(body, null, 2)}`,
                },
            ],
            response_format: { type: "json_object" }
        });

        const text = response.choices[0].message.content?.trim() || "{}";
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (e) {
            console.error("AI response is not valid JSON:", text);
            return NextResponse.json({ error: "Invalid AI response structure" }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            report: parsed,
        });

    } catch (error: any) {
        console.error("AI SEO Report Error:", error);
        return NextResponse.json(
            { success: false, error: error.message || "Unexpected error" },
            { status: 500 }
        );
    }
}
