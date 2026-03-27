import type { Prisma, PrismaClient } from "@prisma/client";
import { evaluateResponse } from "@/server/evaluate";

type AttemptForFinalize = {
    id: string;
    status: "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED";
    startTimestamp: Date;
    test: { totalDurationMinutes: number };
    responses: { questionId: string; selectedAnswer: Prisma.JsonValue | null }[];
};

function getDeadlineMs(attempt: AttemptForFinalize): number {
    const durationSeconds = Math.max(0, Math.floor(attempt.test.totalDurationMinutes * 60));
    return attempt.startTimestamp.getTime() + durationSeconds * 1000;
}

async function computeScore(prisma: PrismaClient, responses: AttemptForFinalize["responses"]) {
    const questionIds = Array.from(new Set(responses.map((r) => r.questionId)));
    if (questionIds.length === 0) return 0;

    const questions = await prisma.question.findMany({
        where: { id: { in: questionIds } },
        select: { id: true, correctAnswer: true, markingSchemeType: true },
    });
    const byId = new Map(questions.map((q) => [q.id, q] as const));

    let score = 0;
    for (const r of responses) {
        const q = byId.get(r.questionId);
        if (!q) continue;
        score += evaluateResponse({
            userAnswer: r.selectedAnswer,
            correctAnswer: q.correctAnswer,
            schemeType: q.markingSchemeType,
        });
    }

    return score;
}

export async function autoSubmitAttemptIfOverdue(
    prisma: PrismaClient,
    attempt: AttemptForFinalize,
    now: Date = new Date(),
): Promise<{ didAutoSubmit: boolean; deadlineMs: number; score?: number }> {
    const deadlineMs = getDeadlineMs(attempt);

    if (attempt.status !== "IN_PROGRESS") {
        return { didAutoSubmit: false, deadlineMs };
    }

    if (now.getTime() < deadlineMs) {
        return { didAutoSubmit: false, deadlineMs };
    }

    const score = await computeScore(prisma, attempt.responses);
    const submittedAt = new Date(Math.min(now.getTime(), deadlineMs));

    const updated = await prisma.studentAttempt.updateMany({
        where: { id: attempt.id, status: "IN_PROGRESS" },
        data: {
            status: "AUTO_SUBMITTED",
            endTimestamp: submittedAt,
            overallScore: score,
        },
    });

    if (updated.count === 0) {
        return { didAutoSubmit: false, deadlineMs };
    }

    await prisma.activityLog.create({
        data: {
            attemptId: attempt.id,
            type: "SUBMIT",
            payload: { score, auto: true, reason: "time_limit" },
        },
    });

    return { didAutoSubmit: true, deadlineMs, score };
}

export async function finalizeAttempt(
    prisma: PrismaClient,
    attempt: AttemptForFinalize,
    status: "SUBMITTED" | "AUTO_SUBMITTED",
    now: Date = new Date(),
): Promise<{ score: number }> {
    const score = await computeScore(prisma, attempt.responses);

    await prisma.studentAttempt.update({
        where: { id: attempt.id },
        data: {
            status,
            endTimestamp: now,
            overallScore: score,
        },
    });

    await prisma.activityLog.create({
        data: {
            attemptId: attempt.id,
            type: "SUBMIT",
            payload: { score, auto: status === "AUTO_SUBMITTED" },
        },
    });

    return { score };
}
