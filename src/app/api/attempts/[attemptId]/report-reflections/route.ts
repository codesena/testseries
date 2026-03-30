import { prisma } from "@/server/db";
import { getAuthUserId } from "@/server/auth";
import { json } from "@/server/json";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ attemptId: z.string().uuid() });

const BodySchema = z.object({
    questionId: z.string().uuid(),
    wrongReason: z.string().trim().max(2000).optional(),
    leftReason: z.string().trim().max(2000).optional(),
    slowReason: z.string().trim().max(2000).optional(),
});

function emptyToNull(v: string | undefined): string | null {
    if (!v) return null;
    const s = v.trim();
    return s ? s : null;
}

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

    const body = BodySchema.safeParse(await req.json().catch(() => null));
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
            testId: true,
        },
    });

    if (!attempt) {
        return json({ error: "Attempt not found" }, { status: 404 });
    }

    if (attempt.status === "IN_PROGRESS") {
        return json({ error: "Attempt is still in progress" }, { status: 409 });
    }

    const questionOnAttempt = await prisma.testQuestion.findFirst({
        where: {
            testId: attempt.testId,
            questionId: body.data.questionId,
        },
        select: { questionId: true },
    });

    if (!questionOnAttempt) {
        return json({ error: "Question not found for this attempt" }, { status: 404 });
    }

    const wrongReason = emptyToNull(body.data.wrongReason);
    const leftReason = emptyToNull(body.data.leftReason);
    const slowReason = emptyToNull(body.data.slowReason);

    if (!wrongReason && !leftReason && !slowReason) {
        return json({ error: "At least one reason is required" }, { status: 400 });
    }

    const saved = await prisma.attemptQuestionReflection.upsert({
        where: {
            attemptId_questionId: {
                attemptId: params.data.attemptId,
                questionId: body.data.questionId,
            },
        },
        create: {
            attemptId: params.data.attemptId,
            questionId: body.data.questionId,
            wrongReason,
            leftReason,
            slowReason,
        },
        update: {
            wrongReason,
            leftReason,
            slowReason,
        },
        select: { attemptId: true, questionId: true, createdAt: true, updatedAt: true },
    });

    return json({
        ok: true,
        reflection: {
            id: `${saved.attemptId}::${saved.questionId}`,
            questionId: saved.questionId,
            wrongReason,
            leftReason,
            slowReason,
            savedAt: saved.updatedAt,
        },
    });
}
