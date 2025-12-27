import { NextResponse } from "next/server";
import { getBingSites } from "@/lib/bing";

export async function GET(request: Request) {
    // For this MVP, we use the env variable. 
    // In a multi-user app, we would fetch the key from the user's profile/db.
    const apiKey = process.env.BING_API_KEY;

    if (!apiKey) {
        return NextResponse.json({ error: "Bing API Key not configured" }, { status: 400 });
    }

    try {
        const sites = await getBingSites(apiKey);
        return NextResponse.json({ sites });
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch Bing sites" }, { status: 500 });
    }
}
