import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function normalizeDomain(url: string): string {
    if (!url) return "";

    // 1. Ensure we have a string
    let clean = String(url).trim();

    // 2. Remove Google's Domain Property prefix
    clean = clean.replace(/^sc-domain:/i, '');

    // 3. Strip protocols
    clean = clean.replace(/^https?:\/\//i, '');

    // 4. Strip www.
    clean = clean.replace(/^www\./i, '');

    // 5. Strip trailing slash
    clean = clean.replace(/\/$/, '');

    // Normalize to lowercase for matching
    return clean.toLowerCase();
}
