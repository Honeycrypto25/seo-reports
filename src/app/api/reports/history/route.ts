import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(request: Request) {
    const session = await getServerSession(authOptions);

    if (!session || !session.accessToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");

    if (!siteId) {
        return NextResponse.json({ error: "Missing siteId parameter" }, { status: 400 });
    }

    try {
        const reports = await prisma.seoReport.findMany({
            where: {
                siteId: siteId
            },
            orderBy: {
                period: 'desc'
            },
            select: {
                id: true,
                period: true,
                createdAt: true,
                summary: true,
                aiReport: true, // We might need this if we load it directly
                dailyData: true
            }
        });

        return NextResponse.json({ reports });
    } catch (error) {
        console.error("Failed to fetch report history:", error);
        return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
    }
}
