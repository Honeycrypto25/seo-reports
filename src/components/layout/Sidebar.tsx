"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Globe, FileBarChart, Settings, LogOut, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Sites", href: "/dashboard/sites", icon: Globe },
    { name: "Reports", href: "/dashboard/reports", icon: FileBarChart },
    { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function Sidebar() {
    const pathname = usePathname();

    return (
        <div className="hidden border-r border-border bg-surface/50 backdrop-blur-xl lg:block lg:w-72 lg:fixed lg:inset-y-0 z-50">
            <div className="flex h-full flex-col">
                {/* Logo Area */}
                <div className="flex h-16 items-center px-6 border-b border-border/50">
                    <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tight">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white shadow-lg shadow-primary/20">
                            <Search className="w-5 h-5" />
                        </div>
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
                            SEO Hub
                        </span>
                    </Link>
                </div>

                {/* Navigation */}
                <div className="flex-1 overflow-y-auto py-6 px-4">
                    <nav className="space-y-1">
                        {navigation.map((item) => {
                            const isActive = pathname === item.href;
                            return (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    className={cn(
                                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                                        isActive
                                            ? "bg-primary/10 text-primary shadow-[0_0_15px_rgba(99,102,241,0.1)] border border-primary/20"
                                            : "text-foreground-muted hover:bg-surface-highlight hover:text-foreground"
                                    )}
                                >
                                    <item.icon className={cn("w-5 h-5", isActive ? "text-primary" : "text-foreground-muted")} />
                                    {item.name}
                                </Link>
                            );
                        })}
                    </nav>
                </div>

                {/* User Profile / Footer */}
                <div className="border-t border-border/50 p-4">
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-highlight/50 border border-border/50 hover:border-primary/30 transition-colors cursor-pointer group">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-zinc-700 to-zinc-600 flex items-center justify-center border border-white/10">
                            <span className="text-sm font-bold text-white">JD</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">John Doe</p>
                            <p className="text-xs text-foreground-muted truncate">john@example.com</p>
                        </div>
                        <LogOut className="w-4 h-4 text-foreground-muted hover:text-foreground transition-colors" />
                    </div>
                </div>
            </div>
        </div>
    );
}
