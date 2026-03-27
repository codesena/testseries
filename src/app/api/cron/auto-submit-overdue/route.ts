import { prisma } from "@/server/db";
import { autoSubmitAttemptIfOverdue } from "@/server/attempt-finalize";
import { json } from "@/server/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
    return json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: Request) {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        return json(
            { error: "CRON_SECRET is not set" },
            { status: 500 },
        );
    }

    const got = req.headers.get("x-cron-secret") ?? "";
    if (got !== secret) return unauthorized();

    const now = new Date();

    const attempts = await prisma.studentAttempt.findMany({
        where: { status: "IN_PROGRESS" },
        orderBy: { startTimestamp: "asc" },
        take: 200,
        select: {
            id: true,
            status: true,
            startTimestamp: true,
            test: { select: { totalDurationMinutes: true } },
            responses: { select: { questionId: true, selectedAnswer: true } },
        },
    });

    let checked = 0;
    let submitted = 0;

    for (const attempt of attempts) {
        checked += 1;
        const res = await autoSubmitAttemptIfOverdue(prisma, attempt, now);
        if (res.didAutoSubmit) submitted += 1;
    }

    return json({ ok: true, checked, submitted, now: now.toISOString() });
}
