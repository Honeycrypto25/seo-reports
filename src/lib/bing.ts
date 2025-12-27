export interface BingSite {
    Url: string;
    Role: string;
    IsVerified: boolean;
}

export async function getBingSites(apiKey: string): Promise<BingSite[]> {
    const endpoint = "https://ssl.bing.com/webmaster/api.svc/json/GetUserSites";

    try {
        const response = await fetch(`${endpoint}?apikey=${apiKey}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            console.error("Bing API Error Status:", response.status);
            throw new Error(`Bing API Error: ${response.statusText}`);
        }

        // The response from Bing is usually wrapped in "d" parameter for JSON
        const data = await response.json();

        // Bing's JSON response format can be { d: [...] } or direct array depending on endpoint version
        // The documentation says it returns a list of sites.
        // Let's handle the { d: ... } wrapper if present.
        const sites = data.d ? data.d : data;

        return sites;
    } catch (error) {
        console.error("Failed to fetch Bing sites", error);
        return [];
    }
}

export async function getBingPerformance(
    apiKey: string,
    siteUrl: string,
    retry = true
): Promise<any> {
    const endpoint = "https://ssl.bing.com/webmaster/api.svc/json/GetSiteStats";

    // Helper function to fetch from a specific URL variant
    const fetchVariant = async (urlVariant: string) => {
        try {
            const res = await fetch(`${endpoint}?siteUrl=${encodeURIComponent(urlVariant)}&apikey=${apiKey}`, {
                method: "GET",
                headers: { "Content-Type": "application/json" },
            });
            if (!res.ok) return null; // 404 or other error
            const json = await res.json();
            const data = json.d || json || [];
            // Return data only if it's an array. If empty array, we treat it as "no data found yet" but valid response.
            // However, for retry logic, we might want to keep trying if empty, assuming active sites usually have data.
            return Array.isArray(data) ? data : [];
        } catch (e) {
            return null;
        }
    };

    // 1. Try exact match first
    let data = await fetchVariant(siteUrl);

    // If data is found and not empty, return it immediately
    if (data && data.length > 0) return data;

    // If we are allowed to retry and data is null (error) or empty (maybe wrong url variant?)
    if (retry && (!data || data.length === 0)) {
        console.log(`[Bing] No data for ${siteUrl}, trying variations...`);

        // Generate variations
        const clean = siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^www\./, '');
        const protocols = ['https://', 'http://'];
        const prefixes = ['', 'www.'];
        const suffixes = ['', '/'];

        for (const proto of protocols) {
            for (const pref of prefixes) {
                for (const suf of suffixes) {
                    const variant = `${proto}${pref}${clean}${suf}`;
                    if (variant === siteUrl) continue; // skip original

                    const variantData = await fetchVariant(variant);
                    if (variantData && variantData.length > 0) {
                        console.log(`[Bing] Found data on variation: ${variant}`);
                        return variantData;
                    }
                }
            }
        }
    }

    // Return whatever we got (empty array likely) if all retries failed
    return data || [];
}
