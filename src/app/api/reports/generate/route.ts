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

        // Bing Data Processing (Note: Bing API GetSiteStats is tricky, usually returns 6 months)
        const processedBing = (bingRaw || []).map((row: any) => {
            let dateStr = row.Date;
            if (typeof dateStr === 'string' && dateStr.includes("/Date(")) {
                const match = dateStr.match(/\d+/);
                const ts = match ? parseInt(match[0]) : 0;
                dateStr = ts ? new Date(ts).toISOString().split('T')[0] : "";
            } else if (dateStr) {
                try {
                    dateStr = new Date(dateStr).toISOString().split('T')[0];
                } catch {
                    dateStr = "";
                }
            }
            return { ...row, date: dateStr };
        });

        const filterBing = (start: string, end: string) => {
            const filtered = processedBing.filter((r: any) => r.date >= start && r.date <= end);
            if (filtered.length === 0) return null;
            const clicks = filtered.reduce((acc: number, r: any) => acc + (r.Clicks || 0), 0);
            const impressions = filtered.reduce((acc: number, r: any) => acc + (r.Impressions || 0), 0);
            const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
            return { clicks, impressions, ctr, position: null };
        };

        const bingCurrent = filterBing(curStart, curEnd);
        const bingPrevious = filterBing(prevStart, prevEnd);
        const bingYoy = filterBing(yoyStart, yoyEnd);

        const calculateDeltas = (curr: any, comp: any) => {
            if (!curr || !comp) return null;
            return {
                clicks_change_pct: comp.clicks > 0 ? parseFloat(((curr.clicks - comp.clicks) / comp.clicks * 100).toFixed(2)) : 0,
                impressions_change_pct: comp.impressions > 0 ? parseFloat(((curr.impressions - comp.impressions) / comp.impressions * 100).toFixed(2)) : 0,
                ctr_change_pp: parseFloat((curr.ctr - comp.ctr).toFixed(2)),
                position_improved: curr.position !== null && comp.position !== null ? curr.position < comp.position : null,
            };
        };

        const gscAI = {
            current: gscPayload.current,
            mom: calculateDeltas(gscPayload.current, gscPayload.previous),
            yoy: calculateDeltas(gscPayload.current, gscPayload.yoy)
        };

        const bingAI = bingCurrent ? {
            current: bingCurrent,
            mom: calculateDeltas(bingCurrent, bingPrevious),
            yoy: calculateDeltas(bingCurrent, bingYoy)
        } : null;

        // 5. Call the new AI Specialized Endpoint
        const host = request.headers.get("host") || "localhost:3000";
        const proto = host.includes("localhost") ? "http" : "https";

        const aiRes = await fetch(`${proto}://${host}/api/ai/seo-report`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                site: normalizedId,
                period: `${year}-${month.toString().padStart(2, '0')}`,
                google: gscAI,
                bing: bingAI,
                trend_16_months: last16Months.length > 3 ? (last16Months[last16Months.length - 1].clicks > last16Months[0].clicks ? "upward" : "mixed") : "neutral"
            })
        });

        const aiData = await aiRes.json();

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
            daily: gscCurrent.map((r: any) => ({
                date: r.keys[0],
                gsc: { clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position },
                bing: { clicks: 0, impressions: 0, ctr: 0 }
            })),
            aiReport: aiData.report,
            summaryCards: aiData.report.highlights // Using AI highlights for summary cards
        };

        try {
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
        } catch (dbError) {
            console.error("Failed to save report to database:", dbError);
            // We still return the report even if save fails, but log the error
        }

        // 7. Return combined report
        return NextResponse.json({
            ...reportData,
            aiReport: aiData.report,
            // Keep keys stable for UI components if needed, or map them
            summaryCards: aiData.summary_cards
        });

    } catch (error) {
        console.error("Report Generation Error:", error);
        return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
    }
}
