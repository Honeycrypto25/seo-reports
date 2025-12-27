import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { google } from "googleapis";
import { NextResponse } from "next/server";

export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session || !session.accessToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: session.accessToken as string });

        const searchConsole = google.webmasters({ version: "v3", auth });

        // Fetch list of sites
        const response = await searchConsole.sites.list();
        const sites = response.data.siteEntry || [];

        return NextResponse.json({ sites });
    } catch (error) {
        console.error("GSC API Error:", error);
        return NextResponse.json({ error: "Failed to fetch sites" }, { status: 500 });
    }
}
