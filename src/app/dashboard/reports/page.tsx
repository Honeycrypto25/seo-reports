"use client";

import { useEffect, useState, useRef } from "react";
import remarkGfm from 'remark-gfm';
import { normalizeDomain } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Search, Globe, FileBarChart, Loader2, Calendar, Sparkles, ShieldCheck, Download, ArrowUpRight, TrendingUp, CheckCircle2 } from "lucide-react";
import {
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, BarChart, Bar
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
            last16Months: historyItem.aiReport?.monthlyTrend || [],
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
                <div id="report-container" className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto pb-20">

                    {/* Report Header Actions */}
                    <div className="flex justify-between items-center bg-surface p-4 rounded-xl border border-border shadow-sm no-print">
                        <div className="flex items-center gap-4">
                            <div className="p-2 rounded-lg bg-primary/10">
                                <FileBarChart className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold">Raport SEO Detaliat</h3>
                                <div className="flex flex-col text-xs text-foreground-muted">
                                    <span>{selectedSite} • {selectedMonth}</span>
                                    <span className="text-primary font-mono mt-1 opacity-80">
                                        Generat la: {new Date().toLocaleTimeString()} (Format Nou)
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
                                Save as PDF
                            </Button>
                        </div>
                    </div>

                    <div ref={reportRef} className="space-y-10 p-8 bg-white dark:bg-zinc-950 rounded-xl shadow-sm text-zinc-900 dark:text-zinc-100 font-sans">

                        {/* 1. Header Document */}
                        <div className="border-b border-zinc-200 dark:border-zinc-800 pb-6 mb-8">
                            <h1 className="text-3xl font-extrabold tracking-tight mb-2">{selectedSite}</h1>
                            <p className="text-xl text-zinc-500 dark:text-zinc-400">
                                Raport Performanță SEO • {new Date(selectedMonth).toLocaleString('ro-RO', { month: 'long', year: 'numeric' })}
                            </p>
                        </div>

                        {/* Components for Markdown */}
                        {(() => {
                            const markdownComponents = {
                                h1: ({ node, ...props }: any) => <h2 className="text-2xl font-bold mt-8 mb-4 flex items-center gap-2 border-b pb-2 border-zinc-100 dark:border-zinc-800" {...props} />,
                                h2: ({ node, ...props }: any) => <h3 className="text-xl font-bold mt-6 mb-3 text-zinc-800 dark:text-zinc-200" {...props} />,
                                h3: ({ node, ...props }: any) => <h4 className="text-lg font-semibold mt-4 mb-2 text-zinc-700 dark:text-zinc-300" {...props} />,
                                p: ({ node, ...props }: any) => <p className="mb-4 leading-relaxed text-zinc-600 dark:text-zinc-400" {...props} />,
                                ul: ({ node, ...props }: any) => <ul className="list-disc pl-6 mb-4 space-y-1 text-zinc-600 dark:text-zinc-400" {...props} />,
                                li: ({ node, ...props }: any) => <li className="pl-1" {...props} />,
                                table: ({ node, ...props }: any) => <div className="overflow-x-auto mb-6 rounded-lg border border-zinc-200 dark:border-zinc-800"><table className="w-full text-sm text-left" {...props} /></div>,
                                thead: ({ node, ...props }: any) => <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 uppercase text-xs font-semibold" {...props} />,
                                tbody: ({ node, ...props }: any) => <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800" {...props} />,
                                tr: ({ node, ...props }: any) => <tr className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50 transition-colors" {...props} />,
                                th: ({ node, ...props }: any) => <th className="px-4 py-3 font-medium whitespace-nowrap" {...props} />,
                                td: ({ node, ...props }: any) => <td className="px-4 py-3 whitespace-nowrap" {...props} />,
                            };

                            return (
                                <>
                                    {/* 2. SEO Actions */}
                                    {report.aiReport?.seo_actions && (
                                        <div className="section-block">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                                {report.aiReport.seo_actions}
                                            </ReactMarkdown>
                                        </div>
                                    )}

                                    {/* 3. Bing Section */}
                                    {report.aiReport?.bing_section && (
                                        <div className="section-block mt-8">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                                {report.aiReport.bing_section}
                                            </ReactMarkdown>
                                        </div>
                                    )}

                                    {/* 4. Google Section */}
                                    {report.aiReport?.google_section && (
                                        <div className="section-block mt-8">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                                {report.aiReport.google_section}
                                            </ReactMarkdown>
                                        </div>
                                    )}

                                    {/* 5. Organic Evolution */}
                                    {/* Split rendering for chart insertion */}
                                    <div className="section-block mt-8 break-inside-avoid">
                                        {report.aiReport?.organic_evolution && (
                                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                                {report.aiReport.organic_evolution}
                                            </ReactMarkdown>
                                        )}

                                        {/* 16-Month Chart */}
                                        {report.last16Months && report.last16Months.length > 0 && (
                                            <div className="mt-6 p-4 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                                                <h4 className="text-sm font-semibold mb-4 text-zinc-500 uppercase tracking-widest text-center">Trend Clickuri Organice (16 Luni)</h4>
                                                <div className="h-[300px] w-full">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <AreaChart data={report.last16Months} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                                            <defs>
                                                                <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
                                                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                                                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                                </linearGradient>
                                                            </defs>
                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" strokeOpacity={0.5} />
                                                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a' }} tickFormatter={(v) => v.slice(5)} minTickGap={30} />
                                                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a' }} width={30} />
                                                            <Tooltip
                                                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                                labelStyle={{ color: '#71717a', fontSize: '12px', marginBottom: '4px' }}
                                                            />
                                                            <Area type="monotone" dataKey="clicks" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorClicks)" name="Clickuri Organice" />
                                                        </AreaChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* 6. Top Keywords */}
                                    {report.aiReport?.top_keywords && (
                                        <div className="section-block mt-8">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                                {report.aiReport.top_keywords}
                                            </ReactMarkdown>
                                        </div>
                                    )}

                                    {/* 7. Conclusions */}
                                    {report.aiReport?.conclusions && (
                                        <div className="section-block mt-8 p-6 bg-green-50/50 dark:bg-green-950/10 rounded-xl border border-green-100 dark:border-green-900/20">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                                {report.aiReport.conclusions}
                                            </ReactMarkdown>
                                        </div>
                                    )}
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}
        </div>
    );
}
