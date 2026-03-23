import { prisma } from "@/server/db";
import { getAuthUserId } from "@/server/auth";
import { evaluateResponse } from "@/server/evaluate";
import { json } from "@/server/json";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ attemptId: z.string().uuid() });

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

    const attempt = await prisma.studentAttempt.findFirst({
        where: { id: params.data.attemptId, studentId: userId },
        select: {
            id: true,
            studentId: true,
            status: true,
            overallScore: true,
            startTimestamp: true,
            endTimestamp: true,
            test: { select: { title: true, totalDurationMinutes: true } },
            responses: {
                select: {
                    questionId: true,
                    selectedAnswer: true,
                    timeSpentSeconds: true,
                    paletteStatus: true,
                },
            },
            activities: {
                where: {
                    type: { in: ["QUESTION_LOAD", "NAVIGATE", "PALETTE_CLICK"] },
                },
                orderBy: { createdAt: "asc" },
                select: { type: true, questionId: true, createdAt: true },
            },
        },
    });

    if (!attempt) {
        return json({ error: "Attempt not found" }, { status: 404 });
    }

    const questionIds = attempt.responses.map((r) => r.questionId);
    const questions = await prisma.question.findMany({
        where: { id: { in: questionIds } },
        select: {
            id: true,
            topicName: true,
            correctAnswer: true,
            markingSchemeType: true,
            subject: { select: { name: true } },
        },
    });
    const byId = new Map(questions.map((q) => [q.id, q] as const));

    const subjectAgg: Record<
        string,
        { totalTimeSeconds: number; correct: number; incorrect: number; unattempted: number }
    > = {};

    const topicAgg: Record<string, { correct: number; total: number }> = {};

    let timeCorrect = 0;
    let timeIncorrect = 0;

    const totalTimeSeconds = attempt.responses.reduce(
        (acc, r) => acc + r.timeSpentSeconds,
        0,
    );

    const perQuestion = attempt.responses.map((r) => {
        const q = byId.get(r.questionId);
        if (!q) return null;

        const marks = evaluateResponse({
            userAnswer: r.selectedAnswer,
            correctAnswer: q.correctAnswer,
            schemeType: q.markingSchemeType,
        });

        const attempted = r.selectedAnswer != null;
        const correct = attempted && marks > 0;

        const subject = q.subject.name;
        subjectAgg[subject] ??= {
            totalTimeSeconds: 0,
            correct: 0,
            incorrect: 0,
            unattempted: 0,
        };
        subjectAgg[subject].totalTimeSeconds += r.timeSpentSeconds;
        if (!attempted) subjectAgg[subject].unattempted += 1;
        else if (correct) subjectAgg[subject].correct += 1;
        else subjectAgg[subject].incorrect += 1;

        topicAgg[q.topicName] ??= { correct: 0, total: 0 };
        topicAgg[q.topicName].total += 1;
        if (correct) topicAgg[q.topicName].correct += 1;

        if (correct) timeCorrect += r.timeSpentSeconds;
        else if (attempted) timeIncorrect += r.timeSpentSeconds;

        return {
            questionId: r.questionId,
            subject,
            topicName: q.topicName,
            timeSpentSeconds: r.timeSpentSeconds,
            attempted,
            correct,
            paletteStatus: r.paletteStatus,
            marks,
        };
    });

    const attemptPath = attempt.activities
        .filter((a) => a.questionId)
        .map((a) => ({
            type: a.type,
            questionId: a.questionId as string,
            at: a.createdAt,
        }));

    const topicAccuracy = Object.entries(topicAgg)
        .map(([topic, v]) => ({
            topic,
            accuracy: v.total === 0 ? 0 : v.correct / v.total,
            correct: v.correct,
            total: v.total,
        }))
        .sort((a, b) => a.accuracy - b.accuracy);

    return json({
        attempt: {
            id: attempt.id,
            studentId: attempt.studentId,
            status: attempt.status,
            score: attempt.overallScore,
            startTimestamp: attempt.startTimestamp,
            endTimestamp: attempt.endTimestamp,
            test: attempt.test,
        },
        analytics: {
            subjectSummary: subjectAgg,
            totalTimeSeconds,
            timeOnCorrectSeconds: timeCorrect,
            timeOnIncorrectSeconds: timeIncorrect,
            attemptPath,
            topicAccuracy,
            perQuestion: perQuestion.filter(Boolean),
        },
    });
}
