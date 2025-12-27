"use client";

import { useEffect, useState } from "react";
import { normalizeDomain } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Search, Globe, FileBarChart, Loader2, Calendar } from "lucide-react";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { Sparkles } from "lucide-react";
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

                    {/* Summary Cards */}
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="p-6 rounded-xl bg-surface border border-border relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <Search className="h-12 w-12 text-[#4285F4]" />
                            </div>
                            <p className="text-sm font-medium text-foreground-muted">Google Clicks</p>
                            <p className="text-3xl font-bold text-foreground mt-2">{report.summary.gscClicks.toLocaleString()}</p>
                            <div className="mt-2 h-1 w-full bg-[#4285F4]/20 rounded-full overflow-hidden">
                                <div className="h-full bg-[#4285F4]" style={{ width: '100%' }}></div>
                            </div>
                        </div>

                        <div className="p-6 rounded-xl bg-surface border border-border relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <Search className="h-12 w-12 text-[#4285F4]" />
                            </div>
                            <p className="text-sm font-medium text-foreground-muted">Google Impressions</p>
                            <p className="text-3xl font-bold text-foreground mt-2">{((report.summary.gscImpressions / 1000).toFixed(1))}k</p>
                        </div>

                        <div className="p-6 rounded-xl bg-surface border border-border relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <Globe className="h-12 w-12 text-[#00897B]" />
                            </div>
                            <p className="text-sm font-medium text-foreground-muted">Bing Clicks</p>
                            <p className="text-3xl font-bold text-foreground mt-2">{report.summary.bingClicks.toLocaleString()}</p>
                            <div className="mt-2 h-1 w-full bg-[#00897B]/20 rounded-full overflow-hidden">
                                <div className="h-full bg-[#00897B]" style={{ width: '100%' }}></div>
                            </div>
                        </div>

                        <div className="p-6 rounded-xl bg-surface border border-border relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <Globe className="h-12 w-12 text-[#00897B]" />
                            </div>
                            <p className="text-sm font-medium text-foreground-muted">Bing Impressions</p>
                            <p className="text-3xl font-bold text-foreground mt-2">{((report.summary.bingImpressions / 1000).toFixed(1))}k</p>
                        </div>
                    </div>

                    {/* AI Insights Section */}
                    {report.aiInsight && (
                        <div className="p-6 rounded-xl border border-primary/20 bg-primary/5 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                                <Sparkles className="h-24 w-24 text-primary" />
                            </div>

                            <div className="flex items-center gap-2 mb-4">
                                <div className="p-1.5 rounded-lg bg-primary/20">
                                    <Sparkles className="h-5 w-5 text-primary" />
                                </div>
                                <h3 className="text-xl font-bold text-foreground">AI Intelligence Report</h3>
                                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-primary text-white rounded">AI Engine</span>
                            </div>

                            <div className="prose prose-invert max-w-none text-foreground-muted leading-relaxed">
                                <ReactMarkdown>{report.aiInsight}</ReactMarkdown>
                            </div>
                        </div>
                    )}

                    {/* Main Chart */}
                    <div className="p-6 rounded-xl bg-surface border border-border h-[400px]">
                        <h3 className="text-lg font-medium mb-6">Traffic Comparison</h3>
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
                                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a' }}
                                    itemStyle={{ color: '#e4e4e7' }}
                                />
                                <Legend />
                                <Area type="monotone" dataKey="gsc.clicks" name="Google Clicks" stroke="#4285F4" fillOpacity={1} fill="url(#colorGsc)" />
                                <Area type="monotone" dataKey="bing.clicks" name="Bing Clicks" stroke="#00897B" fillOpacity={1} fill="url(#colorBing)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                </div>
            )}
        </div>
    );
}
