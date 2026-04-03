import { prisma } from "@/server/db";
import { getAuthUserId } from "@/server/auth";
import { json } from "@/server/json";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateAttemptSchema = z.object({
    testId: z.string().uuid(),
});

export async function POST(req: Request) {
    const userId = await getAuthUserId();
    if (!userId) {
        return json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = CreateAttemptSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return json(
            { error: "Invalid request", details: parsed.error.flatten() },
            { status: 400 },
        );
    }

    const test = await prisma.testSeries.findUnique({
        where: { id: parsed.data.testId },
        select: {
            id: true,
            totalDurationMinutes: true,
            questions: {
                orderBy: { orderIndex: "asc" },
                select: { questionId: true },
            },
        },
    });

    if (!test) {
        return json({ error: "Test not found" }, { status: 404 });
    }

    const baseQuestionOrder = test.questions.map((q) => q.questionId);
    // Keep test-defined ordering (no random shuffle) so questions stay sequential by section.
    const questionOrder = baseQuestionOrder;

    const questions = await prisma.question.findMany({
        where: { id: { in: questionOrder } },
        select: { id: true, options: true },
    });
    const byId = new Map(questions.map((q) => [q.id, q] as const));

    const optionOrders: Record<string, string[]> = {};
    for (const qid of questionOrder) {
        const q = byId.get(qid);
        const opt = (q?.options ?? {}) as Record<string, unknown>;
        // Preserve author-defined option order; no randomization in exam mode.
        optionOrders[qid] = Object.keys(opt);
    }

    const attempt = await prisma.studentAttempt.create({
        data: {
            studentId: userId,
            testId: test.id,
            status: "IN_PROGRESS",
            questionOrder,
            optionOrders,
        },
        select: { id: true },
    });

    await prisma.activityLog.create({
        data: {
            attemptId: attempt.id,
            type: "HEARTBEAT",
            payload: { created: true },
        },
    });

    return json({ attemptId: attempt.id });
}
