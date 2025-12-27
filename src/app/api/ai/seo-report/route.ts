import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
    try {
        const body = await req.json();

        /**
         * body trebuie să conțină deja datele calculate:
         * - luna curentă
         * - luna anterioară (MoM)
         * - aceeași lună anul trecut (YoY)
         * - serie 16 luni (dacă există)
         */

        const SYSTEM_PROMPT = `
Ești un specialist SEO care redactează un raport profesional de performanță organică,
destinat unui client final.

REGULI:
- Nu menționa AI, algoritmi sau termeni tehnici inutili.
- Nu inventa date. Folosește STRICT datele primite.
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
`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.3,
            messages: [
                {
                    role: "system",
                    content: SYSTEM_PROMPT,
                },
                {
                    role: "user",
                    content: JSON.stringify(body, null, 2),
                },
            ],
        });

        const outputText = response.choices[0].message.content?.trim();

        if (!outputText) {
            throw new Error("Empty response from AI");
        }

        let parsed;
        try {
            // Handle potential markdown code blocks in response
            const cleanJson = outputText.replace(/```json\n|\n```/g, "").trim();
            parsed = JSON.parse(cleanJson);
        } catch {
            return NextResponse.json(
                {
                    error: "AI response is not valid JSON",
                    raw: outputText,
                },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            report: parsed,
        });

    } catch (error: any) {
        return NextResponse.json(
            {
                success: false,
                error: error.message || "Unexpected error",
            },
            { status: 500 }
        );
    }
}
