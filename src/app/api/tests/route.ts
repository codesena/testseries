import { prisma } from "@/server/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const tests = await prisma.testSeries.findMany({
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            title: true,
            totalDurationMinutes: true,
            isAdvancedFormat: true,
            createdAt: true,
            _count: { select: { questions: true } },
        },
    });

    return NextResponse.json({ tests });
}
