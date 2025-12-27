import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function normalizeDomain(url: string): string {
    if (!url) return "";

    // 1. Remove sc-domain: prefix used by Google Search Console Domain Properties
    let clean = url.replace(/^sc-domain:/i, '');

    // 2. Remove protocols and www
    clean = clean.replace(/^https?:\/\//i, '');
    clean = clean.replace(/^www\./i, '');

    // 3. Remove trailing slash
    clean = clean.replace(/\/$/, '');

    // 4. If there's still a path (e.g. domain.com/blog), handled by URL parser if needed
    // but for most SEO cases we just want the base site identifier.
    // Let's keep the path if it exists but normalize it.
    try {
        const urlWithProtocol = `https://${clean}`;
        const parsed = new URL(urlWithProtocol);
        let hostname = parsed.hostname.replace(/^www\./i, '');
        let pathname = parsed.pathname === '/' ? '' : parsed.pathname;
        if (pathname.endsWith('/')) pathname = pathname.slice(0, -1);

        return `${hostname}${pathname}`.toLowerCase();
    } catch (e) {
        return clean.toLowerCase();
    }
}
