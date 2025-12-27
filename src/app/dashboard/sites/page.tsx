"use client";

import { useEffect, useState } from "react";
import { normalizeDomain } from "@/lib/utils";
import { CheckCircle2, XCircle, Search, Globe, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Site {
    id: string;
    url: string;
    normalizedUrl: string;
    gscStatus: boolean;
    bingStatus: boolean;
    permissionLevel?: string;
}

export default function SitesPage() {
    const [sites, setSites] = useState<Site[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSites = async () => {
        setLoading(true);
        setError(null);
        try {
            // Fetch GSC Sites
            const gscRes = await fetch("/api/sites/gsc");
            const gscData = await gscRes.json();

            // Fetch Bing Sites
            const bingRes = await fetch("/api/sites/bing");
            const bingData = await bingRes.json();

            const gscSites = gscData.sites || [];
            const bingSites = bingData.sites || [];

            // Create a map of normalized URLs
            const siteMap = new Map<string, Site>();

            // Process GSC Sites
            gscSites.forEach((site: any) => {
                const normalized = normalizeDomain(site.siteUrl);
                if (!siteMap.has(normalized)) {
                    siteMap.set(normalized, {
                        id: normalized,
                        url: site.siteUrl,
                        normalizedUrl: normalized,
                        gscStatus: true,
                        bingStatus: false,
                        permissionLevel: site.permissionLevel
                    });
                } else {
                    const existing = siteMap.get(normalized)!;
                    existing.gscStatus = true;
                    existing.permissionLevel = site.permissionLevel; // GSC permission usually takes precedence for info
                }
            });

            // Process Bing Sites
            bingSites.forEach((site: any) => {
                const normalized = normalizeDomain(site.Url);
                if (!siteMap.has(normalized)) {
                    siteMap.set(normalized, {
                        id: normalized,
                        url: site.Url,
                        normalizedUrl: normalized,
                        gscStatus: false,
                        bingStatus: true,
                    });
                } else {
                    const existing = siteMap.get(normalized)!;
                    existing.bingStatus = true;
                }
            });

            setSites(Array.from(siteMap.values()));
        } catch (err) {
            console.error(err);
            setError("Failed to load sites. Please ensure you are connected to both services.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSites();
    }, []);

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight glow-text">Sites Management</h2>
                    <p className="text-foreground-muted mt-2">Manage your websites across Google and Bing.</p>
                </div>
                <Button onClick={fetchSites} disabled={loading} variant="outline" className="gap-2">
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {error && (
                <div className="p-4 rounded-lg bg-error/10 border border-error/20 text-error flex items-center gap-3">
                    <AlertCircle className="w-5 h-5" />
                    {error}
                </div>
            )}

            <div className="rounded-xl border border-border bg-surface overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-border bg-surface-highlight/50">
                                <th className="px-6 py-4 font-medium text-foreground">Domain</th>
                                <th className="px-6 py-4 font-medium text-foreground text-center">Google Search Console</th>
                                <th className="px-6 py-4 font-medium text-foreground text-center">Bing Webmaster</th>
                                <th className="px-6 py-4 font-medium text-foreground text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading ? (
                                // Loading Skeleton
                                [...Array(3)].map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-6 py-4"><div className="h-4 bg-surface-highlight rounded w-48"></div></td>
                                        <td className="px-6 py-4"><div className="h-6 w-6 bg-surface-highlight rounded-full mx-auto"></div></td>
                                        <td className="px-6 py-4"><div className="h-6 w-6 bg-surface-highlight rounded-full mx-auto"></div></td>
                                        <td className="px-6 py-4"><div className="h-5 bg-surface-highlight rounded w-20 mx-auto"></div></td>
                                    </tr>
                                ))
                            ) : sites.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-foreground-muted">
                                        No sites found. Connect your accounts to get started.
                                    </td>
                                </tr>
                            ) : (
                                sites.map((site) => (
                                    <tr key={site.id} className="hover:bg-surface-highlight/20 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-foreground">{site.normalizedUrl}</div>
                                            <div className="text-xs text-foreground-muted truncate max-w-[200px]">{site.url}</div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {site.gscStatus ? (
                                                <CheckCircle2 className="w-5 h-5 text-success mx-auto" />
                                            ) : (
                                                <XCircle className="w-5 h-5 text-border mx-auto" />
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {site.bingStatus ? (
                                                <CheckCircle2 className="w-5 h-5 text-success mx-auto" />
                                            ) : (
                                                <XCircle className="w-5 h-5 text-border mx-auto" />
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {site.gscStatus && site.bingStatus ? (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                                                    Ready
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning/10 text-warning border border-warning/20">
                                                    Partial
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
