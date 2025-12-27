"use client";

import { useEffect, useState, useRef } from "react";
import remarkGfm from 'remark-gfm';
import { normalizeDomain } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Search, Globe, FileBarChart, Loader2, Calendar, Sparkles, ShieldCheck, Download, ArrowUpRight, TrendingUp, CheckCircle2 } from "lucide-react";
import {
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import ReactMarkdown from 'react-markdown';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

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
    const [exporting, setExporting] = useState(false);
    const [history, setHistory] = useState<any[]>([]);

    const reportRef = useRef<HTMLDivElement>(null);

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

    // 2. Load History when Site Changes
    useEffect(() => {
        if (!selectedSite) return;
        async function fetchHistory() {
            try {
                const res = await fetch(`/api/reports/history?siteId=${selectedSite}`);
                const data = await res.json();
                setHistory(data.reports || []);
            } catch (e) {
                console.error("Failed to fetch history", e);
            }
        }
        fetchHistory();
    }, [selectedSite]);

    const loadFromHistory = (historyItem: any) => {
        setReport({
            summary: historyItem.summary,
            aiReport: historyItem.aiReport,
            daily: historyItem.dailyData,
            summaryCards: historyItem.aiReport.highlights
        });
        setSelectedMonth(historyItem.period);
    };

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

            // Refresh history after generating new report
            const historyRes = await fetch(`/api/reports/history?siteId=${selectedSite}`);
            const historyData = await historyRes.json();
            setHistory(historyData.reports || []);

        } catch (e) {
            console.error(e);
            alert("Failed to generate report. Ensure data exists for this period.");
        } finally {
            setGenerating(false);
        }
    };

    const handleExportPDF = () => {
        window.print();
    };

    return (
        <div className="space-y-8">
            <div className="no-print">
                <h2 className="text-3xl font-bold tracking-tight glow-text">SEO Reports</h2>
                <p className="text-foreground-muted mt-2">Generate cross-platform insights for your websites.</p>
            </div>

            {/* Control Panel */}
            <div className="p-6 rounded-xl bg-surface border border-border flex flex-col sm:flex-row gap-4 items-end sm:items-center no-print">
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

            {/* History Section */}
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 no-print">
                <h3 className="text-lg font-medium flex items-center gap-2">
                    <FileBarChart className="w-5 h-5 text-primary" />
                    Saved Reports
                </h3>
                {history.length === 0 ? (
                    <p className="text-foreground-muted text-sm italic">Nu există rapoarte salvate încă.</p>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {history.map((h: any) => (
                            <div
                                key={h.id}
                                onClick={() => loadFromHistory(h)}
                                className="p-4 rounded-xl bg-surface border border-border hover:border-primary/50 cursor-pointer transition-all hover:bg-surface-highlight/10 group relative overflow-hidden"
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <div className="p-2 rounded-lg bg-surface-highlight/30 text-foreground-muted group-hover:bg-primary group-hover:text-white transition-colors">
                                        <Calendar className="w-5 h-5" />
                                    </div>
                                    <span className="text-xs font-mono text-foreground-muted bg-surface-highlight/20 px-2 py-1 rounded">{new Date(h.createdAt).toLocaleDateString()}</span>
                                </div>
                                <h4 className="font-bold text-lg tracking-tight mb-1">{h.period}</h4>
                                <p className="text-xs text-foreground-muted">View stored analysis</p>

                                <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-primary/0 via-primary/50 to-primary/0 scale-x-0 group-hover:scale-x-100 transition-transform duration-500" />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Report View */}
            {report && (
                <div id="report-container" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

                    {/* Report Header Actions */}
                    <div className="flex justify-between items-center bg-surface p-4 rounded-xl border border-border shadow-lg no-print">
                        <div className="flex items-center gap-4">
                            <div className="p-2 rounded-lg bg-primary/10">
                                <FileBarChart className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold">Raport SEO Detaliat</h3>
                                <div className="flex flex-col text-xs text-foreground-muted">
                                    <span>{selectedSite} • {selectedMonth}</span>
                                    <span className="text-primary font-mono mt-1 opacity-80">
                                        Generat la: {new Date().toLocaleTimeString()} (Versiune Nouă)
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <Button
                                variant="ghost"
                                onClick={() => setReport(null)}
                                className="text-foreground-muted hover:text-foreground"
                            >
                                Close
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handleExportPDF}
                                className="gap-2 border-primary/30 hover:bg-primary/5 hover:border-primary/50 text-primary-foreground"
                            >
                                <Download className="w-4 h-4" />
                                Print / Save PDF
                            </Button>
                        </div>
                    </div>

                    {/* Bing Warning if No Data */}
                    {report.summary.bingClicks === 0 && (
                        <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-200 text-sm flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                            <p>
                                <strong>Notă Bing:</strong> Nu au fost găsite date de trafic pe Bing pentru această perioadă.
                                Raportul conține doar date Google Search Console.
                            </p>
                        </div>
                    )}

                    <div ref={reportRef} className="space-y-8 p-1"> {/* p-1 to prevent shadow clipping in PDF */}

                        {/* Title & Highlights */}
                        {report.aiReport && (
                            <div className="space-y-6">
                                <div className="p-6 rounded-xl bg-gradient-to-br from-primary/10 via-surface to-surface border border-primary/20 shadow-lg relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-primary/10 transition-colors duration-500" />

                                    <div className="flex items-center gap-3 mb-6 relative">
                                        <div className="p-2 rounded-lg bg-primary/20 text-primary">
                                            <Sparkles className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-bold tracking-tight">Insights & Performanță</h3>
                                            <p className="text-xs font-dm text-primary uppercase tracking-widest font-semibold opacity-80">EXECUTIVE SUMMARY</p>
                                        </div>
                                    </div>

                                    <div className="grid gap-4 sm:grid-cols-2 relative">
                                        {report.aiReport.highlights?.map((h: string, i: number) => (
                                            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-surface/50 border border-primary/10 hover:border-primary/30 transition-colors">
                                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                                                <p className="text-sm text-foreground/90 leading-relaxed">{h}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Comparative Table (MOM) */}
                        {report.aiReport?.mom_table_markdown && (
                            <div className="p-6 rounded-xl bg-surface border border-border shadow-md">
                                <div className="flex items-center gap-2 mb-4">
                                    <ArrowUpRight className="w-5 h-5 text-primary" />
                                    <h3 className="text-lg font-bold">Comparație Lunară (MoM)</h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        components={{
                                            table: ({ node, ...props }) => <table className="w-full text-sm text-left border-collapse" {...props} />,
                                            thead: ({ node, ...props }) => <thead className="bg-surface-highlight text-foreground-muted uppercase text-xs" {...props} />,
                                            tbody: ({ node, ...props }) => <tbody className="divide-y divide-border" {...props} />,
                                            tr: ({ node, ...props }) => <tr className="hover:bg-surface-highlight/50 transition-colors" {...props} />,
                                            th: ({ node, ...props }) => <th className="px-4 py-3 font-medium border-b border-border" {...props} />,
                                            td: ({ node, ...props }) => <td className="px-4 py-3 border-b border-border text-foreground" {...props} />,
                                        }}
                                    >
                                        {report.aiReport.mom_table_markdown}
                                    </ReactMarkdown>
                                </div>
                            </div>
                        )}

                        {/* Google & Charts */}
                        <div className="grid gap-8 lg:grid-cols-2">
                            {/* Text Analysis */}
                            <div className="space-y-6">
                                {report.aiReport?.google_section && (
                                    <div className="p-6 rounded-xl bg-surface border border-border h-full">
                                        <div className="flex items-center gap-2 mb-4 text-blue-400">
                                            <Search className="w-5 h-5" />
                                            <h3 className="font-bold">Analiză Google Search Console</h3>
                                        </div>
                                        <div className="prose prose-invert max-w-none text-foreground-muted text-sm leading-relaxed">
                                            <ReactMarkdown>{report.aiReport.google_section}</ReactMarkdown>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Charts */}
                            <div className="p-6 rounded-xl bg-surface border border-border min-h-[300px]">
                                <h3 className="font-bold mb-6 text-sm">Evoluție Zilnică Click-uri</h3>
                                <div className="h-[250px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={report.daily}>
                                            <defs>
                                                <linearGradient id="colorGsc" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                </linearGradient>
                                                <linearGradient id="colorBing" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                            <XAxis
                                                dataKey="date"
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: '#71717a', fontSize: 10 }}
                                                tickFormatter={(str: string) => str.slice(-2)}
                                                minTickGap={30}
                                            />
                                            <YAxis
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: '#71717a', fontSize: 10 }}
                                                width={30}
                                            />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px' }}
                                                itemStyle={{ fontSize: '12px' }}
                                                labelStyle={{ color: '#a1a1aa', marginBottom: '4px' }}
                                            />
                                            <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                                            <Area
                                                type="monotone"
                                                dataKey="gsc.clicks"
                                                name="Google"
                                                stroke="#3b82f6"
                                                fillOpacity={1}
                                                fill="url(#colorGsc)"
                                                strokeWidth={2}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="bing.clicks"
                                                name="Bing"
                                                stroke="#10b981"
                                                fillOpacity={1}
                                                fill="url(#colorBing)"
                                                strokeWidth={2}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        {/* Summary Mini Cards */}
                        <div className="grid grid-cols-2 gap-4">
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
            )}
        </div>
    );
}
