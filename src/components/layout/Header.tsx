"use client";

import { Bell, Search, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Header() {
    return (
        <header className="sticky top-0 z-40 h-16 border-b border-border bg-background/80 backdrop-blur-xl">
            <div className="flex h-16 items-center justify-between gap-x-4 px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">

                {/* Mobile Menu Trigger (Hidden on Desktop) */}
                <button type="button" className="-m-2.5 p-2.5 text-gray-400 lg:hidden hover:text-white transition-colors">
                    <span className="sr-only">Open sidebar</span>
                    <Menu className="h-6 w-6" aria-hidden="true" />
                </button>

                {/* Separator for mobile */}
                <div className="h-6 w-px bg-white/10 lg:hidden" aria-hidden="true" />

                <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
                    {/* Search Bar */}
                    <form className="relative flex flex-1" action="#" method="GET">
                        <label htmlFor="search-field" className="sr-only">
                            Search
                        </label>
                        <div className="relative w-full max-w-sm flex items-center">
                            <Search className="pointer-events-none absolute inset-y-0 left-0 h-full w-5 text-gray-500 pl-2" aria-hidden="true" />
                            <input
                                id="search-field"
                                className="block h-full w-full border-0 bg-transparent py-0 pl-10 pr-0 text-foreground placeholder:text-gray-500 focus:ring-0 sm:text-sm"
                                placeholder="Search sites..."
                                type="search"
                                name="search"
                            />
                        </div>
                    </form>

                    <div className="flex items-center gap-x-4 lg:gap-x-6">
                        {/* Notification Button */}
                        <button type="button" className="-m-2.5 p-2.5 text-gray-400 hover:text-white transition-colors relative">
                            <span className="sr-only">View notifications</span>
                            <Bell className="h-6 w-6" aria-hidden="true" />
                            <span className="absolute top-2 right-2 flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                            </span>
                        </button>

                        {/* Separator */}
                        <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-white/10" aria-hidden="true" />

                        {/* Action Button (e.g. Add Site) */}
                        <Button size="sm" className="hidden sm:flex">
                            + Add Site
                        </Button>
                    </div>
                </div>
            </div>
        </header>
    );
}
