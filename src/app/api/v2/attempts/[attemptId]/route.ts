import { getAuthUserId } from "@/server/auth";
import { prisma } from "@/server/db";
import { json } from "@/server/json";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({
    attemptId: z.string().uuid(),
});

export async function GET(
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

    const attempt = await prisma.examV2Attempt.findFirst({
        where: {
            id: params.data.attemptId,
            userId,
        },
        select: {
            id: true,
            examId: true,
            status: true,
            startTimestamp: true,
            scheduledEndAt: true,
            submittedAt: true,
            totalScore: true,
            lastHeartbeatAt: true,
            clientOffsetMs: true,
            responses: {
                select: {
                    questionId: true,
                    responseJson: true,
                    numericValue: true,
                    answerState: true,
                    timeSpentSeconds: true,
                    marksAwarded: true,
                    evaluatedAt: true,
                    lastUpdated: true,
                },
            },
            events: {
                orderBy: { createdAt: "desc" },
                take: 200,
                select: {
                    id: true,
                    clientEventId: true,
                    questionId: true,
                    eventType: true,
                    payload: true,
                    createdAt: true,
                },
            },
        },
    });

    if (!attempt) {
        return json({ error: "Attempt not found" }, { status: 404 });
    }

    return json({
        serverNow: new Date(),
        attempt: {
            ...attempt,
            events: [...attempt.events].reverse(),
        },
    });
}
