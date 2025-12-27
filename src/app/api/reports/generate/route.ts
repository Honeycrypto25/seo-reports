import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getGSCPerformance } from "@/lib/gsc";
import { getBingPerformance, getBingSites } from "@/lib/bing";
import { normalizeDomain } from "@/lib/utils";
import { google } from "googleapis";

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);

    // Note: For Bing we rely on the ENV apiKey for now.
    const bingApiKey = process.env.BING_API_KEY;

    if (!session || !session.accessToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { normalizedId, year, month } = await request.json();

        if (!normalizedId || !year || !month) {
            return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
        }

        // 1. Resolve Actual URLs
        // We need to find the specific URL GSC knows and the one Bing knows.
        let gscUrl = "";
        let bingUrl = "";

        // 1a. Find GSC Url
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: session.accessToken as string });
        const searchConsole = google.webmasters({ version: "v3", auth });
        const gscSitesRes = await searchConsole.sites.list();
        const gscSites = gscSitesRes.data.siteEntry || [];

        const matchedGsc = gscSites.find((s: any) => normalizeDomain(s.siteUrl) === normalizedId);
        if (matchedGsc) gscUrl = matchedGsc.siteUrl!;

        // 1b. Find Bing Url
        if (bingApiKey) {
            const bingSites = await getBingSites(bingApiKey);
            const matchedBing = bingSites.find((s) => normalizeDomain(s.Url) === normalizedId);
            if (matchedBing) bingUrl = matchedBing.Url;
        }

        if (!gscUrl || !bingUrl) {
            return NextResponse.json({
                error: "Site not found in one or both services.",
                details: { gscUrl, bingUrl }
            }, { status: 404 });
        }

        // 2. Prepare Dates
        const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
        // Get last day of month
        const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
        const endDate = `${year}-${month.toString().padStart(2, '0')}-${lastDay}`;

        // 3. Fetch Data in Parallel
        const [gscData, bingDataRaw] = await Promise.all([
            getGSCPerformance(session.accessToken as string, gscUrl, startDate, endDate),
            bingApiKey ? getBingPerformance(bingApiKey, bingUrl) : Promise.resolve([])
        ]);

        // 4. Process & Merge Data
        // Bing returns a generic series, often with 'Date' in format like "/Date(1623456780000)/"
        // We need to normalize Bing dates.
        const processedBing = bingDataRaw.map((row: any) => {
            // Extract timestamp if specific format, or generic ISO
            let dateStr = row.Date;
            if (typeof dateStr === 'string' && dateStr.includes("/Date(")) {
                const ts = parseInt(dateStr.match(/\d+/)[0]);
                dateStr = new Date(ts).toISOString().split('T')[0];
            } else if (dateStr) {
                dateStr = new Date(dateStr).toISOString().split('T')[0];
            }
            return { ...row, date: dateStr };
        }).filter((r: any) => r.date >= startDate && r.date <= endDate);

        // Create a daily map
        const dailyData: any[] = [];
        const days = parseInt(lastDay.toString());

        for (let d = 1; d <= days; d++) {
            const dateKey = `${year}-${month.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;

            const gscRow = gscData.find((r: any) => r.keys[0] === dateKey); // keys[0] is date dimension
            const bingRow = processedBing.find((r: any) => r.date === dateKey);

            dailyData.push({
                date: dateKey,
                gsc: {
                    clicks: gscRow?.clicks || 0,
                    impressions: gscRow?.impressions || 0,
                    ctr: gscRow?.ctr || 0,
                    position: gscRow?.position || 0
                },
                bing: {
                    clicks: bingRow?.Clicks || 0,
                    impressions: bingRow?.Impressions || 0,
                    ctr: 0, // Bing might not strictly return CTR in this endpoint, usually computed
                }
            });
        }

        // Compute Totals
        const summary = dailyData.reduce((acc, day) => ({
            gscClicks: acc.gscClicks + day.gsc.clicks,
            gscImpressions: acc.gscImpressions + day.gsc.impressions,
            bingClicks: acc.bingClicks + day.bing.clicks,
            bingImpressions: acc.bingImpressions + day.bing.impressions,
        }), { gscClicks: 0, gscImpressions: 0, bingClicks: 0, bingImpressions: 0 });

        return NextResponse.json({
            period: { year, month },
            site: normalizedId,
            summary,
            daily: dailyData
        });

    } catch (error) {
        console.error("Report Generation Error:", error);
        return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
    }
}
