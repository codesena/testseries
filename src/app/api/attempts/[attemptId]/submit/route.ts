import { prisma } from "@/server/db";
import { getAuthUserId } from "@/server/auth";
import { json } from "@/server/json";
import { autoSubmitAttemptIfOverdue, finalizeAttempt } from "@/server/attempt-finalize";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ attemptId: z.string().uuid() });

export async function POST(
    _req: Request,
    ctx: { params: Promise<{ attemptId: string }> },
) {
    const userId = await getAuthUserId();
    if (!userId) {
        return json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = ParamsSchema.safeParse(await ctx.params);
    if (!params.success) {
        return json({ error: "Invalid attempt id" }, { status: 400 });
    }

    const attempt = await prisma.studentAttempt.findFirst({
        where: { id: params.data.attemptId, studentId: userId },
        select: {
            id: true,
            status: true,
            startTimestamp: true,
            test: { select: { totalDurationMinutes: true } },
            responses: {
                select: { questionId: true, selectedAnswer: true },
            },
        },
    });

    if (!attempt) {
        return json({ error: "Attempt not found" }, { status: 404 });
    }

    if (attempt.status !== "IN_PROGRESS") {
        return json({ error: "Attempt already submitted" }, { status: 409 });
    }

    const now = new Date();
    const auto = await autoSubmitAttemptIfOverdue(prisma, attempt, now);
    if (auto.didAutoSubmit) {
        return json({ ok: true, score: auto.score ?? 0, status: "AUTO_SUBMITTED" });
    }

    const result = await finalizeAttempt(prisma, attempt, "SUBMITTED", now);
    return json({ ok: true, score: result.score, status: "SUBMITTED" });
}
