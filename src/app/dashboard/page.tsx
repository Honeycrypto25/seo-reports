import { ArrowUpRight, Globe, Search, MousePointerClick } from "lucide-react";
import { cn } from "@/lib/utils";
import { LoginButton } from "@/components/auth/LoginButton";

const stats = [
    { name: 'Total Sites', value: '12', change: '+2', changeType: 'positive', icon: Globe },
    { name: 'Total Impressions', value: '2.4M', change: '+12.5%', changeType: 'positive', icon: Search },
    { name: 'Total Clicks', value: '84.2K', change: '-2.1%', changeType: 'negative', icon: MousePointerClick },
    { name: 'Avg. CTR', value: '3.5%', change: '+0.4%', changeType: 'positive', icon: ArrowUpRight },
];

export default function DashboardPage() {
    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-3xl font-bold tracking-tight glow-text">Overview</h2>
                <p className="text-foreground-muted mt-2">Here's what's happening with your SEO performance.</p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {stats.map((stat) => (
                    <div
                        key={stat.name}
                        className="group relative overflow-hidden rounded-xl bg-surface border border-border p-6 hover:border-primary/50 transition-all duration-300 hover:shadow-[0_0_20px_rgba(99,102,241,0.1)]"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <stat.icon className="h-16 w-16 text-primary rotate-12" />
                        </div>

                        <p className="text-sm font-medium text-foreground-muted">{stat.name}</p>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold text-foreground">{stat.value}</span>
                            <span className={cn(
                                "text-xs font-medium px-2 py-0.5 rounded-full",
                                stat.changeType === 'positive'
                                    ? "bg-success/10 text-success"
                                    : "bg-error/10 text-error"
                            )}>
                                {stat.change}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Integration Status */}
            <div className="rounded-xl border border-border bg-surface p-6">
                <div className="flex flex-col gap-4">
                    {/* Google Search Console */}
                    <div className="flex items-center justify-between p-4 rounded-lg bg-surface-highlight/30 border border-border/50">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#4285F4]/10 flex items-center justify-center">
                                <Search className="w-5 h-5 text-[#4285F4]" />
                            </div>
                            <div>
                                <h4 className="font-medium text-foreground">Google Search Console</h4>
                                <p className="text-xs text-foreground-muted">Import sites and performance data</p>
                            </div>
                        </div>
                        <LoginButton />
                    </div>

                    {/* Bing Webmaster Tools */}
                    <div className="flex items-center justify-between p-4 rounded-lg bg-surface-highlight/30 border border-border/50">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#00897B]/10 flex items-center justify-center">
                                <Globe className="w-5 h-5 text-[#00897B]" />
                            </div>
                            <div>
                                <h4 className="font-medium text-foreground">Bing Webmaster Tools</h4>
                                <p className="text-xs text-foreground-muted">Connect via API Key in .env</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-success bg-success/10 px-2 py-1 rounded-full font-medium border border-success/20">
                                Configured via ENV
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Placeholder for future Charts */}
            <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-xl border border-border bg-surface/50 backdrop-blur-sm p-6 min-h-[400px] flex items-center justify-center text-foreground-muted border-dashed">
                    Performance Chart Placeholder
                </div>
                <div className="rounded-xl border border-border bg-surface/50 backdrop-blur-sm p-6 min-h-[400px] flex items-center justify-center text-foreground-muted border-dashed">
                    Recent Alerts Placeholder
                </div>
            </div>
        </div>
    );
}
