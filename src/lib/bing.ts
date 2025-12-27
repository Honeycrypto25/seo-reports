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
    // Bing GetSiteStats returns the last 6 months of data by default.
    // We will fetch it all and filter in the application logic.
    const endpoint = "https://ssl.bing.com/webmaster/api.svc/json/GetSiteStats";

    try {
        const response = await fetch(`${endpoint}?siteUrl=${encodeURIComponent(siteUrl)}&apikey=${apiKey}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (response.status === 404 && retry) {
            // Bing is picky about trailing slashes. If it failed, try the opposite.
            const altUrl = siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : `${siteUrl}/`;
            console.log(`Bing 404 for ${siteUrl}, retrying with ${altUrl}`);
            return getBingPerformance(apiKey, altUrl, false);
        }

        if (!response.ok) {
            throw new Error(`Bing API Error: ${response.statusText}`);
        }

        const data = await response.json();
        // Wrapper 'd'
        return data.d || data || [];
    } catch (error) {
        console.error(`Failed to fetch Bing stats for ${siteUrl}:`, error);
        return [];
    }
}
