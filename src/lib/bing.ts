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
    const endpoint = "https://ssl.bing.com/webmaster/api.svc/json/GetRankAndTrafficStats";

    // Helper function to fetch from a specific URL variant
    const fetchVariant = async (urlVariant: string) => {
        try {
            // 1. Try POST with JSON body (Preferred for GetRankAndTrafficStats)
            const resPost = await fetch(`${endpoint}?apikey=${apiKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ siteUrl: urlVariant })
            });

            if (resPost.ok) {
                const json = await resPost.json();
                const data = json.d || json || [];
                return Array.isArray(data) ? data : [];
            }

            // 2. Fallback to GET with query param
            const resGet = await fetch(`${endpoint}?siteUrl=${encodeURIComponent(urlVariant)}&apikey=${apiKey}`, {
                method: "GET",
                headers: { "Content-Type": "application/json" },
            });

            if (resGet.ok) {
                const json = await resGet.json();
                const data = json.d || json || [];
                return Array.isArray(data) ? data : [];
            }

            return null;
        } catch (e) {
            console.error(`Bing API error for ${urlVariant}:`, e);
            return null;
        }
    };

    // Helper to normalize keys and format date
    const normalizeBingData = (items: any[]) => {
        return items.map((item: any) => {
            // Bing typically uses PascalCase: Date, Clicks, Impressions, etc.
            // Also Date might be in a specific format.
            let dateStr = item.Date || item.date;

            // Handle ASP.NET JSON Date format: /Date(1234567890)/ or /Date(1234567890-0700)/
            if (typeof dateStr === 'string' && dateStr.includes('/Date(')) {
                // Extract the first sequence of digits, ignoring optional timezone suffix
                const match = dateStr.match(/\/Date\((-?\d+)/);
                if (match) {
                    dateStr = new Date(parseInt(match[1])).toISOString().split('T')[0];
                }
            } else if (dateStr) {
                // Try to parse standard date string
                try {
                    dateStr = new Date(dateStr).toISOString().split('T')[0];
                } catch (e) {
                    // keep original if fail
                }
            }

            return {
                date: dateStr,
                clicks: item.Clicks ?? item.clicks ?? 0,
                impressions: item.Impressions ?? item.impressions ?? 0,
                ctr: item.CbRank ?? item.ctr ?? 0, // Note: Bing might call it BroadCtr, or calculated. GSC uses 'ctr'.
                // Actually Bing GetRankAndTrafficStats returns: Date, Clicks, Impressions, AddedDate, ... 
                // Let's assume standard names.
                position: item.AveragePosition ?? item.position ?? 0
            };
        });
    };

    // 1. Try exact match first
    let rawData = await fetchVariant(siteUrl);

    // If data is found and not empty, return normalized
    if (rawData && rawData.length > 0) return normalizeBingData(rawData);

    // If we are allowed to retry and data is null (error) or empty (maybe wrong url variant?)
    if (retry && (!rawData || rawData.length === 0)) {
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
                        return normalizeBingData(variantData);
                    }
                }
            }
        }
    }

    // Return whatever we got (empty array likely) if all retries failed
    return rawData ? normalizeBingData(rawData) : [];
}
