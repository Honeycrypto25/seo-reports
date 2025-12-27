import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function normalizeDomain(url: string): string {
    try {
        // If it doesn't have a protocol, add https:// to make URL parser happy
        const urlWithProtocol = url.startsWith('http') ? url : `https://${url}`;
        const parsed = new URL(urlWithProtocol);
        // Remove www.
        let hostname = parsed.hostname.replace(/^www\./, '');
        // Remove trailing slash from pathname if it's just root
        const pathname = parsed.pathname === '/' ? '' : parsed.pathname;

        // Combine hostname + pathname, remove trailing slash
        let normalized = `${hostname}${pathname}`;
        if (normalized.endsWith('/')) {
            normalized = normalized.slice(0, -1);
        }

        return normalized.toLowerCase();
    } catch (e) {
        // Fallback for simple strings
        return url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').toLowerCase();
    }
}
