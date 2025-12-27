import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getGSCSites } from "@/lib/gsc";
import { NextResponse } from "next/server";

export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session || !session.accessToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const sites = await getGSCSites(session.accessToken as string);
        return NextResponse.json({ sites });
    } catch (error) {
        console.error("GSC API Error:", error);
        return NextResponse.json({ error: "Failed to fetch sites" }, { status: 500 });
    }
}
