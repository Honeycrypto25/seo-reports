import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

export async function generateSEOInsight(data: {
    site: string;
    period: string;
    summary: any;
}) {
    const { site, period, summary } = data;

    const prompt = `
    You are an expert SEO Strategist. Analyze the following monthly SEO performance data for the website "${site}" for the period ${period}.
    
    Data Summary:
    - Google Search Console: ${summary.gscClicks} clicks, ${summary.gscImpressions} impressions.
    - Bing Webmaster Tools: ${summary.bingClicks} clicks, ${summary.bingImpressions} impressions.
    
    Tasks:
    1. Compare performance between Google and Bing.
    2. Provide 3 actionable SEO recommendations based on these numbers.
    3. Keep the tone professional, concise, and helpful.
    4. Use Markdown formatting.
    
    Focus on trends: If impressions are much higher than clicks, suggest CTR optimization. If one platform is significantly underperforming the other, suggest technical checks for that search engine.
  `;

    try {
        const { text } = await generateText({
            model: openai('gpt-5-mini'),
            system: 'You are a high-level SEO analyst providing executive summaries.',
            prompt: prompt,
        });

        return text;
    } catch (error) {
        console.error("AI Generation Error:", error);
        return "AI analysis is currently unavailable. Please check your API configuration.";
    }
}
