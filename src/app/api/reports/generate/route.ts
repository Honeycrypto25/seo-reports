import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getGSCPerformance } from "@/lib/gsc";
import { getBingPerformance, getBingSites } from "@/lib/bing";
import { normalizeDomain } from "@/lib/utils";
import { google } from "googleapis";
import { subMonths, startOfMonth, endOfMonth, format, subYears } from "date-fns";
import prisma from "@/lib/db";

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
        const fetchBingStats = async (url: string) => {
            if (!bingApiKey || !url) return [];
            try {
                return await getBingPerformance(bingApiKey, url);
            } catch (err) {
                console.error("Bing Stats Fetch Error:", err);
                return [];
            }
        };

        const [
            gscCurrent,
            gscPrevious,
            gscYoy,
            gscTrendRaw, // Fetch daily for trend and aggregate manually
            gscKeywords, // Top keywords
            bingRaw
        ] = await Promise.all([
            getGSCPerformance(session.accessToken as string, gscUrl, curStart, curEnd),
            getGSCPerformance(session.accessToken as string, gscUrl, prevStart, prevEnd),
            getGSCPerformance(session.accessToken as string, gscUrl, yoyStart, yoyEnd),
            getGSCPerformance(session.accessToken as string, gscUrl, sixteenMonthsStart, curEnd, ["date"]),
            getGSCPerformance(session.accessToken as string, gscUrl, curStart, curEnd, ["query"]),
            fetchBingStats(bingUrl)
        ]);

        // Helper to sum up GSC arrays
        const summarizeGSC = (rows: any[]) => {
            const clicks = rows.reduce((acc, r) => acc + (r.clicks || 0), 0);
            const impressions = rows.reduce((acc, r) => acc + (r.impressions || 0), 0);
            const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
            const position = rows.length > 0 ? rows.reduce((acc, r) => acc + (r.position || 0), 0) / rows.length : 0;
            return { clicks, impressions, ctr, position };
        };

        // Define bingPayloadCurrent explicitly
        const bingPayloadCurrent = bingRaw.length > 0 ? summarizeGSC(bingRaw) : null;

        const gscPayload = {
            current: summarizeGSC(gscCurrent),
            previous: summarizeGSC(gscPrevious),
            yoy: summarizeGSC(gscYoy)
        };

        // Sort and slice keywords to get real Top 50 by Clicks
        const top50Keywords = gscKeywords
            .sort((a, b) => (b.clicks || 0) - (a.clicks || 0))
            .slice(0, 50)
            .map((k, i) => ({
                rank: i + 1,
                keyword: k.keys?.[0] || "(unknown)",
                clicks: k.clicks,
                impressions: k.impressions,
                ctr: k.ctr,
                position: k.position
            }));

        // ... (rest of the logic)

        const aiPayload = {
            site: normalizedId,
            periodLabel: `${year}-${month.toString().padStart(2, '0')}`,
            google: {
                current: gscPayload.current,
                previous: gscPayload.previous,
                yoy: gscPayload.yoy
            },
            bing: bingPayloadCurrent ? {
                current: { clicks: bingPayloadCurrent.clicks, impressions: bingPayloadCurrent.impressions, ctr: bingPayloadCurrent.ctr },
                previous: bingPrevious,
                yoy: bingYoy
            } : null,
            bing_status: bingStatus,
            last16Months: last16Months.map(m => ({
                month: m.month,
                clicks: m.clicks,
                impressions: m.impressions,
                ctr: m.ctr,
                position: m.position
            })),
            topKeywords: top50Keywords
        };

        // Call AI Service
        const aiRes = await fetch(`${proto}://${host}/api/ai/seo-report`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(aiPayload)
        });

        const aiData = await aiRes.json();

        // Merge Daily Data
        const dailyMap = new Map();

        gscCurrent.forEach((r: any) => {
            dailyMap.set(r.keys[0], {
                date: r.keys[0],
                gsc: { clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position },
                bing: { clicks: 0, impressions: 0, ctr: 0 }
            });
        });

        if (bingDailyData && Array.isArray(bingDailyData)) {
            bingDailyData.forEach((r: any) => {
                if (!r.date) return;
                const existing = dailyMap.get(r.date);
                if (existing) {
                    existing.bing = { clicks: r.clicks || 0, impressions: r.impressions || 0, ctr: 0 };
                } else {
                    dailyMap.set(r.date, {
                        date: r.date,
                        gsc: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
                        bing: { clicks: r.clicks || 0, impressions: r.impressions || 0, ctr: 0 }
                    });
                }
            });
        }

        const dailyDataArray = Array.from(dailyMap.values()).sort((a: any, b: any) => a.date.localeCompare(b.date));

        // 6. Save to Database (Neon via Prisma)
        const reportData = {
            period: { year, month },
            site: normalizedId,
            summary: {
                gscClicks: gscPayload.current.clicks,
                gscImpressions: gscPayload.current.impressions,
                bingClicks: bingPayloadCurrent?.clicks || 0,
                bingImpressions: bingPayloadCurrent?.impressions || 0,
            },
            daily: dailyDataArray,
            last16Months,
            aiReport: aiData.report,
            summaryCards: aiData.report?.highlights // Safe access
        };

        try {
            if (reportData.aiReport) {
                // Attach chart data to aiReport for persistence
                (reportData.aiReport as any).monthlyTrend = reportData.last16Months;

                await prisma.seoReport.upsert({
                    where: {
                        siteId_period: {
                            siteId: normalizedId,
                            period: `${year}-${month.toString().padStart(2, '0')}`
                        }
                    },
                    update: {
                        summary: reportData.summary as any,
                        aiReport: reportData.aiReport as any,
                        summaryCards: reportData.summaryCards as any,
                        dailyData: reportData.daily as any,
                    },
                    create: {
                        siteId: normalizedId,
                        period: `${year}-${month.toString().padStart(2, '0')}`,
                        summary: reportData.summary as any,
                        aiReport: reportData.aiReport as any,
                        summaryCards: reportData.summaryCards as any,
                        dailyData: reportData.daily as any,
                    }
                });
                console.log("Report saved successfully to DB");
            } else {
                console.warn("Skipping DB Save: AI Report data is missing/invalid");
            }
        } catch (dbError: any) {
            console.error("CRITICAL DB ERROR: Failed to save report to database:", dbError);
            if (dbError.code) console.error("Prisma Error Code:", dbError.code);
            if (dbError.meta) console.error("Prisma Error Meta:", dbError.meta);
            // We still return the report even if save fails, but log the error prominently
        }

        // 7. Return combined report
        return NextResponse.json({
            ...reportData,
            aiReport: aiData.report,
            // Keep keys stable for UI components if needed, or map them
            summaryCards: aiData.summary_cards,
            _debug: {
                bingUrl,
                bingRawLength: bingRaw?.length || 0,
                bingSample: bingRaw?.slice(0, 2),
                filteredCount: bingDailyData?.length || 0,
                year, month
            }
        });

    } catch (error) {
        console.error("Report Generation Error:", error);
        return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
    }
}
