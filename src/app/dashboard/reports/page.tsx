"use client";

import { useEffect, useState } from "react";
import { normalizeDomain } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Search, Globe, FileBarChart, Loader2, Calendar, Sparkles, ShieldCheck } from "lucide-react";
import {
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import ReactMarkdown from 'react-markdown';

interface ReadySite {
    id: string; // normalized
    gscUrl: string;
    bingUrl: string;
}

export default function ReportsPage() {
    const [readySites, setReadySites] = useState<ReadySite[]>([]);
    const [loadingSites, setLoadingSites] = useState(true);

    const [selectedSite, setSelectedSite] = useState("");
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM

    const [report, setReport] = useState<any>(null);
    const [generating, setGenerating] = useState(false);

    // 1. Load Available "Ready" Sites
    useEffect(() => {
        async function loadSites() {
            try {
                const [gscRes, bingRes] = await Promise.all([
                    fetch("/api/sites/gsc").then(r => r.json()),
                    fetch("/api/sites/bing").then(r => r.json())
                ]);

                const gscList = gscRes.sites || [];
                const bingList = bingRes.sites || [];

                const gscMap = new Map();
                gscList.forEach((s: any) => gscMap.set(normalizeDomain(s.siteUrl), s.siteUrl));

                const combined: ReadySite[] = [];
                bingList.forEach((s: any) => {
                    const norm = normalizeDomain(s.Url);
                    if (gscMap.has(norm)) {
                        combined.push({
                            id: norm,
                            gscUrl: gscMap.get(norm),
                            bingUrl: s.Url
                        });
                    }
                });
                setReadySites(combined);
                if (combined.length > 0) setSelectedSite(combined[0].id);

            } catch (e) {
                console.error("Failed to load sites", e);
            } finally {
                setLoadingSites(false);
            }
        }
        loadSites();
    }, []);

    const handleGenerate = async () => {
        if (!selectedSite || !selectedMonth) return;
        setGenerating(true);
        setReport(null);

        try {
            const [year, month] = selectedMonth.split("-");
            const res = await fetch("/api/reports/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    normalizedId: selectedSite,
                    year,
                    month
                })
            });

            if (!res.ok) throw new Error("Failed");

            const data = await res.json();
            setReport(data);
        } catch (e) {
            console.error(e);
            alert("Failed to generate report. Ensure data exists for this period.");
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-3xl font-bold tracking-tight glow-text">SEO Reports</h2>
                <p className="text-foreground-muted mt-2">Generate cross-platform insights for your websites.</p>
            </div>

            {/* Control Panel */}
            <div className="p-6 rounded-xl bg-surface border border-border flex flex-col sm:flex-row gap-4 items-end sm:items-center">
                <div className="flex-1 w-full space-y-2">
                    <label className="text-sm font-medium text-foreground">Select Website</label>
                    <select
                        className="w-full h-10 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        value={selectedSite}
                        onChange={(e) => setSelectedSite(e.target.value)}
                        disabled={loadingSites}
                    >
                        {loadingSites ? <option>Loading sites...</option> :
                            readySites.length === 0 ? <option>No ready sites found</option> :
                                readySites.map(s => <option key={s.id} value={s.id}>{s.id}</option>)
                        }
                    </select>
                </div>

                <div className="w-full sm:w-48 space-y-2">
                    <label className="text-sm font-medium text-foreground">Month</label>
                    <div className="relative">
                        <input
                            type="month"
                            className="w-full h-10 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                        />
                        <Calendar className="absolute right-3 top-2.5 h-4 w-4 text-foreground-muted pointer-events-none" />
                    </div>
                </div>

                <div className="w-full sm:w-auto">
                    <Button
                        onClick={handleGenerate}
                        disabled={generating || !selectedSite || readySites.length === 0}
                        className="w-full sm:w-auto h-10 mt-6 sm:mt-0"
                    >
                        {generating ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
                        ) : (
                            <><FileBarChart className="w-4 h-4 mr-2" /> Generate Report</>
                        )}
                    </Button>
                </div>
            </div>

            {/* Report View */}
            {report && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

                    {/* AI Highlights Header */}
                    {report.aiReport && report.aiReport.highlights && (
                        <div className="p-8 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-background to-accent/5 relative overflow-hidden shadow-2xl">
                            <div className="absolute top-0 right-0 p-6 opacity-20 pointer-events-none">
                                <Sparkles className="h-32 w-32 text-primary" />
                            </div>

                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 rounded-xl bg-primary/20 shadow-inner">
                                    <Sparkles className="h-6 w-6 text-primary" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-foreground tracking-tight">Puncte Forte & Analiză AI</h3>
                                    <p className="text-xs text-primary font-bold uppercase tracking-widest">Premium Intelligence Engine</p>
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                {report.aiReport.highlights.map((h: string, i: number) => (
                                    <div key={i} className="flex gap-3 items-start p-4 rounded-xl bg-surface/40 border border-border/50 hover:border-primary/50 transition-all group">
                                        <div className="mt-1 w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(99,102,241,0.8)] shrink-0" />
                                        <p className="text-sm text-foreground leading-relaxed font-medium">{h}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Platform Sections & Final Summary */}
                    <div className="grid gap-8 lg:grid-cols-3">
                        <div className="lg:col-span-2 space-y-8">
                            {/* Detailed Analysis */}
                            <div className="p-6 rounded-xl bg-surface border border-border space-y-6">
                                {report.aiReport?.google_section && (
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2 text-[#4285F4]">
                                            <Search className="w-5 h-5" />
                                            <h4 className="font-bold text-lg">Analiză Google Search Console</h4>
                                        </div>
                                        <div className="prose prose-invert max-w-none text-foreground-muted text-sm leading-relaxed">
                                            <ReactMarkdown>{report.aiReport.google_section}</ReactMarkdown>
                                        </div>
                                    </div>
                                )}

                                <div className="h-px bg-border/50" />

                                {report.aiReport?.bing_section && (
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2 text-[#00897B]">
                                            <Globe className="w-5 h-5" />
                                            <h4 className="font-bold text-lg">Analiză Bing Webmaster</h4>
                                        </div>
                                        <div className="prose prose-invert max-w-none text-foreground-muted text-sm leading-relaxed">
                                            <ReactMarkdown>{report.aiReport.bing_section}</ReactMarkdown>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Main Chart */}
                            <div className="p-6 rounded-xl bg-surface border border-border h-[400px]">
                                <h3 className="text-lg font-medium mb-6">Evoluție Zilnică Click-uri</h3>
                                <ResponsiveContainer width="100%" height="90%">
                                    <AreaChart data={report.daily} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorGsc" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#4285F4" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#4285F4" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="colorBing" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#00897B" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#00897B" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="date" stroke="#52525b" tickFormatter={(str) => str.slice(8)} />
                                        <YAxis stroke="#52525b" />
                                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px' }}
                                            itemStyle={{ color: '#e4e4e7' }}
                                        />
                                        <Legend />
                                        <Area type="monotone" dataKey="gsc.clicks" name="Google" stroke="#4285F4" fillOpacity={1} fill="url(#colorGsc)" />
                                        <Area type="monotone" dataKey="bing.clicks" name="Bing" stroke="#00897B" fillOpacity={1} fill="url(#colorBing)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Sidebar Analysis */}
                        <div className="space-y-8">
                            {/* Final Conclusion Card */}
                            {report.aiReport?.final_summary && (
                                <div className="p-6 rounded-xl bg-primary border border-primary/20 text-white shadow-xl shadow-primary/10">
                                    <h4 className="font-bold mb-3 flex items-center gap-2">
                                        <ShieldCheck className="w-5 h-5" />
                                        Concluzie Executivă
                                    </h4>
                                    <p className="text-sm leading-relaxed opacity-90 italic">
                                        "{report.aiReport.final_summary}"
                                    </p>
                                </div>
                            )}

                            {/* Trend Card */}
                            {report.aiReport?.trend_summary && (
                                <div className="p-6 rounded-xl bg-surface border border-border">
                                    <h4 className="font-bold mb-3 text-foreground-muted uppercase text-xs tracking-widest">Trend pe 16 Luni</h4>
                                    <p className="text-sm text-foreground leading-relaxed">
                                        {report.aiReport.trend_summary}
                                    </p>
                                </div>
                            )}

                            {/* Summary Mini Cards */}
                            <div className="grid grid-cols-1 gap-4">
                                <div className="p-4 rounded-xl bg-surface/50 border border-border">
                                    <p className="text-[10px] font-bold text-foreground-muted uppercase tracking-tighter">Total Clicks</p>
                                    <p className="text-2xl font-bold">{(report.summary.gscClicks + report.summary.bingClicks).toLocaleString()}</p>
                                </div>
                                <div className="p-4 rounded-xl bg-surface/50 border border-border">
                                    <p className="text-[10px] font-bold text-foreground-muted uppercase tracking-tighter">Total Impressions</p>
                                    <p className="text-2xl font-bold">{(report.summary.gscImpressions + report.summary.bingImpressions).toLocaleString()}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
