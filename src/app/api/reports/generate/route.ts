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
            bingRaw
        ] = await Promise.all([
            getGSCPerformance(session.accessToken as string, gscUrl, curStart, curEnd),
            getGSCPerformance(session.accessToken as string, gscUrl, prevStart, prevEnd),
            getGSCPerformance(session.accessToken as string, gscUrl, yoyStart, yoyEnd),
            getGSCPerformance(session.accessToken as string, gscUrl, sixteenMonthsStart, curEnd, ["date"]),
            fetchBingStats(bingUrl)
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

        // Aggregate daily GSC data into months for the 16-month payload
        const monthlyGroups: Record<string, any> = {};
        gscTrendRaw.forEach((row: any) => {
            const m = row.keys[0].substring(0, 7); // YYYY-MM
            if (!monthlyGroups[m]) {
                monthlyGroups[m] = { clicks: 0, impressions: 0, sumPos: 0, count: 0 };
            }
            monthlyGroups[m].clicks += row.clicks || 0;
            monthlyGroups[m].impressions += row.impressions || 0;
            monthlyGroups[m].sumPos += row.position || 0;
            monthlyGroups[m].count += 1;
        });

        const last16Months = Object.entries(monthlyGroups).map(([month, data]: [string, any]) => ({
            month,
            clicks: data.clicks,
            impressions: data.impressions,
            ctr: data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0,
            position: data.count > 0 ? data.sumPos / data.count : null
        })).sort((a, b) => a.month.localeCompare(b.month));

        const gscPayload = {
            current: summarizeGSC(gscCurrent),
            previous: gscPrevious.length ? summarizeGSC(gscPrevious) : null,
            yoy: gscYoy.length ? summarizeGSC(gscYoy) : null,
            last16Months
        };

        // Bing Data Processing with Robust Date Parsing
        // ------------------------------------------------------------------
        // Parse Bing's ASP.NET AJAX Date format or ISO format
        const parseBingDate = (dString: string): Date | null => {
            if (!dString) return null;
            // Handle /Date(1724742000000-0700)/
            const match = /\/Date\((\d+)(?:[+-]\d+)?\)\//.exec(dString);
            if (match) {
                return new Date(parseInt(match[1], 10));
            }
            const d = new Date(dString);
            return isNaN(d.getTime()) ? null : d;
        };

        const matchesMonth = (dString: string, tYear: string, tMonth: string) => {
            try {
                const d = parseBingDate(dString);
                if (!d) return false;

                const y = d.getUTCFullYear();
                const m = d.getUTCMonth() + 1;
                // Check local too just in case of timezone edge cases on boundary
                const yL = d.getFullYear();
                const mL = d.getMonth() + 1;

                return (y === parseInt(tYear) && m === parseInt(tMonth)) || (yL === parseInt(tYear) && mL === parseInt(tMonth));
            } catch { return false; }
        };

        // 1. Current Month Data for Bing
        const bingDailyData = bingRaw
            .filter((d: any) => matchesMonth(d.Date, year, month))
            .map((d: any) => {
                const dateObj = parseBingDate(d.Date);
                return {
                    date: dateObj ? dateObj.toISOString().split('T')[0] : `${year}-${month.padStart(2, '0')}-01`,
                    clicks: d.Clicks || 0,
                    impressions: d.Impressions || 0,
                    avgPos: d.AveragePosition || 0
                };
            });

        const bingCurrent = bingDailyData.length > 0
            ? bingDailyData.reduce((acc: any, curr: any) => ({
                clicks: acc.clicks + curr.clicks,
                impressions: acc.impressions + curr.impressions,
                ctr: 0,
                position: 0
            }), { clicks: 0, impressions: 0, ctr: 0, position: 0 })
            : null;

        if (bingCurrent) {
            bingCurrent.ctr = bingCurrent.impressions > 0 ? (bingCurrent.clicks / bingCurrent.impressions) * 100 : 0;
            const totalWeightedPos = bingDailyData.reduce((acc: number, curr: any) => acc + (curr.avgPos * curr.impressions), 0);
            bingCurrent.position = bingCurrent.impressions > 0 ? totalWeightedPos / bingCurrent.impressions : 0;
        }

        console.log(`[Bing Helper] Site: ${bingUrl}, Filtered Count: ${bingDailyData.length}`);

        // 2. Previous Month (Bing) - calculated only for AI context mainly
        let prevY = parseInt(year);
        let prevM = parseInt(month) - 1;
        if (prevM < 1) { prevM = 12; prevY -= 1; }
        const bingPrevRaw = bingRaw.filter((d: any) => matchesMonth(d.Date, prevY.toString(), prevM.toString()));
        const bingPrevious = bingPrevRaw.length > 0 ? {
            clicks: bingPrevRaw.reduce((a: number, c: any) => a + (c.Clicks || 0), 0),
            impressions: bingPrevRaw.reduce((a: number, c: any) => a + (c.Impressions || 0), 0),
            ctr: 0, position: 0
        } : null;
        if (bingPrevious && bingPrevious.impressions > 0) bingPrevious.ctr = (bingPrevious.clicks / bingPrevious.impressions) * 100;

        // 3. YoY Month (Bing)
        const bingYoyRaw = bingRaw.filter((d: any) => matchesMonth(d.Date, (parseInt(year) - 1).toString(), month));
        const bingYoy = bingYoyRaw.length > 0 ? {
            clicks: bingYoyRaw.reduce((a: number, c: any) => a + (c.Clicks || 0), 0),
            impressions: bingYoyRaw.reduce((a: number, c: any) => a + (c.Impressions || 0), 0),
            ctr: 0, position: 0
        } : null;
        if (bingYoy && bingYoy.impressions > 0) bingYoy.ctr = (bingYoy.clicks / bingYoy.impressions) * 100;

        // Construct Payload for AI
        const bingStatus = !bingUrl ? 'not_connected'
            : (!bingRaw || bingRaw.length === 0) ? 'no_data_or_error'
                : 'active';

        const host = request.headers.get("host") || "localhost:3000";
        const proto = host.includes("localhost") ? "http" : "https";

        const aiPayload = {
            site: normalizedId,
            periodLabel: `${year}-${month.toString().padStart(2, '0')}`,
            google: {
                current: gscPayload.current,
                previous: gscPayload.previous,
                yoy: gscPayload.yoy
            },
            bing: bingCurrent ? {
                current: { clicks: bingCurrent.clicks, impressions: bingCurrent.impressions, ctr: bingCurrent.ctr },
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
            }))
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
                bingClicks: bingCurrent?.clicks || 0,
                bingImpressions: bingCurrent?.impressions || 0,
            },
            daily: dailyDataArray,
            aiReport: aiData.report,
            summaryCards: aiData.report?.highlights // Safe access
        };

        try {
            if (reportData.aiReport) {
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
