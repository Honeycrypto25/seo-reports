"use client";

import { signIn } from "next-auth/react";
import { Search, Globe, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SignInPage() {
    return (
        <div className="flex min-h-screen items-center justify-center p-4 bg-background relative overflow-hidden">
            {/* Background Decorative Elements */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary opacity-10 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-accent opacity-5 blur-[100px] rounded-full pointer-events-none" />

            {/* Glass Card */}
            <div className="w-full max-w-md p-8 rounded-2xl border border-border bg-surface/50 backdrop-blur-2xl shadow-2xl relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700">

                {/* Header / Logo */}
                <div className="flex flex-col items-center text-center mb-10">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white shadow-lg shadow-primary/20 mb-6">
                        <Search className="w-8 h-8" />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight glow-text mb-2">SEO Report Hub</h1>
                    <p className="text-foreground-muted">Advanced Google & Bing Intelligence</p>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-4 mb-10">
                    <div className="p-3 rounded-lg bg-surface-highlight/30 border border-border/50 flex flex-col items-center text-center">
                        <Globe className="w-5 h-5 text-primary mb-2" />
                        <span className="text-[10px] uppercase tracking-wider font-bold text-foreground-muted">Cross-Platform</span>
                    </div>
                    <div className="p-3 rounded-lg bg-surface-highlight/30 border border-border/50 flex flex-col items-center text-center">
                        <ShieldCheck className="w-5 h-5 text-success mb-2" />
                        <span className="text-[10px] uppercase tracking-wider font-bold text-foreground-muted">Secure Access</span>
                    </div>
                </div>

                {/* Login Button */}
                <div className="space-y-4">
                    <Button
                        className="w-full h-12 text-lg font-semibold bg-white text-black hover:bg-white/90 shadow-xl transition-all active:scale-[0.98]"
                        onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                    >
                        <img
                            src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png"
                            alt="Google"
                            className="w-5 h-5 mr-3"
                        />
                        Sign in with Google
                    </Button>

                    <p className="text-center text-xs text-foreground-muted px-4">
                        By signing in, you agree to our terms of service and recognize this is a private restricted portal.
                    </p>
                </div>

                {/* Footer Glow */}
                <div className="mt-12 flex justify-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                    <div className="w-1 h-1 rounded-full bg-primary animate-pulse delay-75" />
                    <div className="w-1 h-1 rounded-full bg-primary animate-pulse delay-150" />
                </div>
            </div>
        </div>
    );
}
