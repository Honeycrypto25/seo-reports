"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { LogOut, Chrome } from "lucide-react";

export function LoginButton() {
    const { data: session, status } = useSession();

    if (status === "loading") {
        return <Button variant="ghost" disabled>Loading...</Button>;
    }

    if (session) {
        return (
            <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-foreground-muted hidden sm:inline-block">
                    Connected as <span className="text-foreground">{session.user?.email}</span>
                </span>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => signOut()}
                    className="gap-2"
                >
                    <LogOut className="w-4 h-4" />
                    Disconnect
                </Button>
            </div>
        );
    }

    return (
        <Button
            onClick={() => signIn("google")}
            className="gap-2 bg-white text-black hover:bg-gray-100 shadow-none border border-border"
        >
            <Chrome className="w-4 h-4" />
            Connect Google Search Console
        </Button>
    );
}
