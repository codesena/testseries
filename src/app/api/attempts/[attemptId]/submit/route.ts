import { prisma } from "@/server/db";
import { evaluateResponse } from "@/server/evaluate";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ attemptId: z.string().uuid() });

export async function POST(
    _req: Request,
    ctx: { params: Promise<{ attemptId: string }> },
) {
    const params = ParamsSchema.safeParse(await ctx.params);
    if (!params.success) {
        return NextResponse.json({ error: "Invalid attempt id" }, { status: 400 });
    }

    const attempt = await prisma.studentAttempt.findUnique({
        where: { id: params.data.attemptId },
        select: {
            id: true,
            status: true,
            test: { select: { totalDurationMinutes: true } },
            responses: {
                select: { questionId: true, selectedAnswer: true, paletteStatus: true },
            },
        },
    });

    if (!attempt) {
        return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
    }

    if (attempt.status !== "IN_PROGRESS") {
        return NextResponse.json({ error: "Attempt already submitted" }, { status: 409 });
    }

    const questionIds = attempt.responses.map((r) => r.questionId);
    const questions = await prisma.question.findMany({
        where: { id: { in: questionIds } },
        select: { id: true, correctAnswer: true, markingSchemeType: true },
    });
    const byId = new Map(questions.map((q) => [q.id, q] as const));

    let score = 0;
    for (const r of attempt.responses) {
        const q = byId.get(r.questionId);
        if (!q) continue;

        score += evaluateResponse({
            userAnswer: r.selectedAnswer,
            correctAnswer: q.correctAnswer,
            schemeType: q.markingSchemeType,
        });
    }

    await prisma.studentAttempt.update({
        where: { id: attempt.id },
        data: {
            status: "SUBMITTED",
            endTimestamp: new Date(),
            overallScore: score,
        },
    });

    await prisma.activityLog.create({
        data: {
            attemptId: attempt.id,
            type: "SUBMIT",
            payload: { score },
        },
    });

    return NextResponse.json({ ok: true, score });
}
