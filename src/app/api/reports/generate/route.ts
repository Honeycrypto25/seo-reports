import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getGSCPerformance } from "@/lib/gsc";
import { getBingPerformance, getBingSites } from "@/lib/bing";
import { normalizeDomain } from "@/lib/utils";
import { google } from "googleapis";
import { subMonths, startOfMonth, endOfMonth, format, subYears } from "date-fns";

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
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
        let gscUrl = "";
        let bingUrl = "";

        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: session.accessToken as string });
        const searchConsole = google.webmasters({ version: "v3", auth });
        const gscSitesRes = await searchConsole.sites.list();
        const gscSites = gscSitesRes.data.siteEntry || [];

        const matchedGsc = gscSites.find((s: any) => normalizeDomain(s.siteUrl) === normalizedId);
        if (matchedGsc) gscUrl = matchedGsc.siteUrl!;

        if (bingApiKey) {
            const bingSites = await getBingSites(bingApiKey);
            const matchedBing = bingSites.find((s) => normalizeDomain(s.Url) === normalizedId);
            if (matchedBing) bingUrl = matchedBing.Url;
        }

        if (!gscUrl) {
            return NextResponse.json({ error: "Site not found in Google Search Console." }, { status: 404 });
        }

        // 2. Prepare Date Ranges
        const targetDate = new Date(parseInt(year), parseInt(month) - 1, 15);
        const curStart = format(startOfMonth(targetDate), "yyyy-MM-dd");
        const curEnd = format(endOfMonth(targetDate), "yyyy-MM-dd");

        const prevDate = subMonths(targetDate, 1);
        const prevStart = format(startOfMonth(prevDate), "yyyy-MM-dd");
        const prevEnd = format(endOfMonth(prevDate), "yyyy-MM-dd");

        const yoyDate = subYears(targetDate, 1);
        const yoyStart = format(startOfMonth(yoyDate), "yyyy-MM-dd");
        const yoyEnd = format(endOfMonth(yoyDate), "yyyy-MM-dd");

        const sixteenMonthsStart = format(startOfMonth(subMonths(targetDate, 15)), "yyyy-MM-dd");

        // 3. Fetch Data in Parallel
        const fetchBing = (url: string, start: string, end: string) => {
            if (!bingApiKey || !url) return Promise.resolve([]);
            return getBingPerformance(bingApiKey, url);
        };

        const [
            gscCurrent,
            gscPrevious,
            gscYoy,
            gscSixteen,
            bingRaw
        ] = await Promise.all([
            getGSCPerformance(session.accessToken as string, gscUrl, curStart, curEnd),
            getGSCPerformance(session.accessToken as string, gscUrl, prevStart, prevEnd),
            getGSCPerformance(session.accessToken as string, gscUrl, yoyStart, yoyEnd),
            getGSCPerformance(session.accessToken as string, gscUrl, sixteenMonthsStart, curEnd, ["month"]),
            fetchBing(bingUrl, curStart, curEnd)
        ]);

        // 4. Transform Data for the new AI endpoint
        const summarizeGSC = (rows: any[]) => {
            const clicks = rows.reduce((acc, r) => acc + (r.clicks || 0), 0);
            const impressions = rows.reduce((acc, r) => acc + (r.impressions || 0), 0);
            const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
            const sumPos = rows.reduce((acc, r) => acc + (r.position || 0), 0);
            const position = rows.length > 0 ? sumPos / rows.length : null;
            return { clicks, impressions, ctr, position };
        };

        const gscPayload = {
            current: summarizeGSC(gscCurrent),
            previous: gscPrevious.length ? summarizeGSC(gscPrevious) : null,
            yoy: gscYoy.length ? summarizeGSC(gscYoy) : null,
            last16Months: gscSixteen.map((r: any) => ({
                month: r.keys[0].substring(0, 7),
                clicks: r.clicks,
                impressions: r.impressions,
                ctr: r.ctr * 100,
                position: r.position
            }))
        };

        // Bing Data Processing (Note: Bing API GetSiteStats is tricky, usually returns 6 months)
        const processedBing = bingRaw.map((row: any) => {
            let dateStr = row.Date;
            if (typeof dateStr === 'string' && dateStr.includes("/Date(")) {
                const match = dateStr.match(/\d+/);
                const ts = match ? parseInt(match[0]) : 0;
                dateStr = ts ? new Date(ts).toISOString().split('T')[0] : "";
            } else if (dateStr) {
                dateStr = new Date(dateStr).toISOString().split('T')[0];
            }
            return { ...row, date: dateStr };
        });

        const filterBing = (start: string, end: string) => {
            const filtered = processedBing.filter((r: any) => r.date >= start && r.date <= end);
            const clicks = filtered.reduce((acc: number, r: any) => acc + (r.Clicks || 0), 0);
            const impressions = filtered.reduce((acc: number, r: any) => acc + (r.Impressions || 0), 0);
            const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
            return { clicks, impressions, ctr, position: null };
        };

        const bingPayload = bingUrl ? {
            current: filterBing(curStart, curEnd),
            previous: filterBing(prevStart, prevEnd),
            yoy: filterBing(yoyStart, yoyEnd),
            last16Months: null // Bing doesn't easily return 16 months in one go without pagination
        } : null;

        // 5. Call the new AI Specialized Endpoint
        const host = request.headers.get("host") || "localhost:3000";
        const proto = host.includes("localhost") ? "http" : "https";

        const aiRes = await fetch(`${proto}://${host}/api/ai/seo-report`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                site: normalizedId,
                month: `${year}-${month.toString().padStart(2, '0')}`,
                google: gscPayload,
                bing: bingPayload
            })
        });

        const aiData = await aiRes.json();

        // 6. Return combined report
        return NextResponse.json({
            period: { year, month },
            site: normalizedId,
            summary: {
                gscClicks: gscPayload.current.clicks,
                gscImpressions: gscPayload.current.impressions,
                bingClicks: bingPayload?.current.clicks || 0,
                bingImpressions: bingPayload?.current.impressions || 0,
            },
            daily: gscCurrent.map((r: any) => ({
                date: r.keys[0],
                gsc: { clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position },
                bing: { clicks: 0, impressions: 0, ctr: 0 } // Daily bing would require another endpoint
            })),
            aiReport: aiData.report,
            summaryCards: aiData.summary_cards
        });

    } catch (error) {
        console.error("Report Generation Error:", error);
        return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
    }
}
