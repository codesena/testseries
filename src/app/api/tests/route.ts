import { prisma } from "@/server/db";
import { json } from "@/server/json";

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

    return json(
        { tests },
        {
            headers: {
                "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
            },
        },
    );
}
