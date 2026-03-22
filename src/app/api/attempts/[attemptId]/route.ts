import { prisma } from "@/server/db";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ attemptId: z.string().uuid() });

export async function GET(
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
            startTimestamp: true,
            test: {
                select: { id: true, title: true, totalDurationMinutes: true },
            },
            questionOrder: true,
            optionOrders: true,
            responses: {
                select: {
                    questionId: true,
                    selectedAnswer: true,
                    paletteStatus: true,
                    timeSpentSeconds: true,
                    lastUpdated: true,
                },
            },
        },
    });

    if (!attempt) {
        return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
    }

    const questionOrder = attempt.questionOrder as string[];
    const optionOrders = attempt.optionOrders as Record<string, string[]>;

    const questions = await prisma.question.findMany({
        where: { id: { in: questionOrder } },
        select: {
            id: true,
            subject: { select: { id: true, name: true } },
            topicName: true,
            questionText: true,
            options: true,
            markingSchemeType: true,
        },
    });
    const byId = new Map(questions.map((q) => [q.id, q] as const));

    const orderedQuestions = questionOrder
        .map((qid) => {
            const q = byId.get(qid);
            if (!q) return null;

            const options = q.options as Record<string, string>;
            const order = optionOrders[qid] ?? Object.keys(options);
            const orderedOptions = order
                .filter((k) => k in options)
                .map((k) => ({ key: k, text: options[k] }));

            return {
                id: q.id,
                subject: q.subject,
                topicName: q.topicName,
                questionText: q.questionText,
                options: orderedOptions,
                markingSchemeType: q.markingSchemeType,
            };
        })
        .filter(Boolean);

    return NextResponse.json({
        attempt: {
            id: attempt.id,
            status: attempt.status,
            startTimestamp: attempt.startTimestamp,
            test: attempt.test,
            questions: orderedQuestions,
            responses: attempt.responses,
            serverNow: new Date().toISOString(),
        },
    });
}
