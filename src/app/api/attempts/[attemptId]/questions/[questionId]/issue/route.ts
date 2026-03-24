import { prisma } from "@/server/db";
import { getAuthUserId } from "@/server/auth";
import { json } from "@/server/json";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({
    attemptId: z.string().uuid(),
    questionId: z.string().uuid(),
});

const BodySchema = z.object({
    issue: z.string().trim().min(2).max(120),
    details: z.string().trim().max(5000).optional(),
});

export async function POST(
    req: Request,
    ctx: { params: Promise<{ attemptId: string; questionId: string }> },
) {
    const userId = await getAuthUserId();
    if (!userId) {
        return json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = ParamsSchema.safeParse(await ctx.params);
    if (!params.success) {
        return json({ error: "Invalid params" }, { status: 400 });
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
        select: { id: true, questionOrder: true, testId: true },
    });

    if (!attempt) {
        return json({ error: "Attempt not found" }, { status: 404 });
    }

    const questionOrder = Array.isArray(attempt.questionOrder)
        ? (attempt.questionOrder as unknown[]).map(String)
        : [];

    let questionInAttempt = questionOrder.includes(params.data.questionId);
    if (!questionInAttempt) {
        const existsInTest = await prisma.testQuestion.findFirst({
            where: { testId: attempt.testId, questionId: params.data.questionId },
            select: { questionId: true },
        });
        questionInAttempt = Boolean(existsInTest);
    }

    if (!questionInAttempt) {
        return json({ error: "Question not part of attempt" }, { status: 400 });
    }

    const created = await prisma.questionIssueReport.create({
        data: {
            attemptId: attempt.id,
            questionId: params.data.questionId,
            userId,
            issue: body.data.issue,
            details: body.data.details ? body.data.details : null,
        },
        select: { id: true, createdAt: true },
    });

    return json({
        ok: true,
        report: { id: String(created.id), createdAt: created.createdAt },
    });
}
