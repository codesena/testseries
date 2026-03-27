import { prisma } from "@/server/db";
import { ActivityType } from "@prisma/client";
import { getAuthUserId } from "@/server/auth";
import { json } from "@/server/json";
import { autoSubmitAttemptIfOverdue } from "@/server/attempt-finalize";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ attemptId: z.string().uuid() });

const EventSchema = z.object({
    type: z.nativeEnum(ActivityType),
    questionId: z.string().uuid().optional(),
    payload: z.any().optional(),
});

export async function POST(
    req: Request,
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

    const body = EventSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
        return json(
            { error: "Invalid request", details: body.error.flatten() },
            { status: 400 },
        );
    }

    const attempt = await prisma.studentAttempt.findFirst({
        where: { id: params.data.attemptId, studentId: userId },
        select: {
            id: true,
            status: true,
            startTimestamp: true,
            test: { select: { totalDurationMinutes: true } },
            responses: { select: { questionId: true, selectedAnswer: true } },
        },
    });
    if (!attempt) {
        return json({ error: "Attempt not found" }, { status: 404 });
    }

    const auto = await autoSubmitAttemptIfOverdue(prisma, attempt, new Date());
    if (auto.didAutoSubmit || attempt.status !== "IN_PROGRESS") {
        return json({ error: "Attempt submitted" }, { status: 409 });
    }

    const created = await prisma.activityLog.create({
        data: {
            attemptId: params.data.attemptId,
            questionId: body.data.questionId,
            type: body.data.type,
            payload: body.data.payload,
        },
        select: { id: true, createdAt: true },
    });

    return json({
        ok: true,
        event: {
            id: String(created.id),
            createdAt: created.createdAt,
        },
    });
}
