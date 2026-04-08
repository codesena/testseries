import {
    getAssessmentAttemptPath,
    getAssessmentReportPath,
    getTestSeriesVariant,
    type AssessmentVariant,
} from "@/lib/assessment";
import { prisma } from "@/server/db";

export class AssessmentAttemptError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "AssessmentAttemptError";
        this.status = status;
    }
}

export type CreatedAssessmentAttempt = {
    attemptId: string;
    assessmentId: string;
    variant: AssessmentVariant;
    attemptPath: string;
    reportPath: string;
    legacyAttemptId?: string;
    v2Attempt?: {
        id: string;
        examId: string;
        status: string;
        startTimestamp: Date;
        scheduledEndAt: Date;
        clientOffsetMs: number;
    };
};

export type DeletedAssessmentAttempt = {
    attemptId: string;
    variant: AssessmentVariant;
    assessmentId: string;
    userId: string;
    status: string;
    score: number | null;
};

function buildCreatedAttempt(
    variant: AssessmentVariant,
    assessmentId: string,
    attemptId: string,
    extras?: Pick<CreatedAssessmentAttempt, "legacyAttemptId" | "v2Attempt">,
): CreatedAssessmentAttempt {
    return {
        attemptId,
        assessmentId,
        variant,
        attemptPath: getAssessmentAttemptPath(variant, attemptId),
        reportPath: getAssessmentReportPath(variant, attemptId),
        ...extras,
    };
}

export async function createLegacyAssessmentAttempt(
    userId: string,
    testId: string,
): Promise<CreatedAssessmentAttempt> {
    const test = await prisma.testSeries.findUnique({
        where: { id: testId },
        select: {
            id: true,
            isAdvancedFormat: true,
            questions: {
                orderBy: { orderIndex: "asc" },
                select: { questionId: true },
            },
        },
    });

    if (!test) {
        throw new AssessmentAttemptError(404, "Test not found");
    }

    const questionOrder = test.questions.map((question) => question.questionId);
    const questions = await prisma.question.findMany({
        where: { id: { in: questionOrder } },
        select: { id: true, options: true },
    });
    const questionById = new Map(questions.map((question) => [question.id, question] as const));

    const optionOrders: Record<string, string[]> = {};
    for (const questionId of questionOrder) {
        const question = questionById.get(questionId);
        const options = (question?.options ?? {}) as Record<string, unknown>;
        optionOrders[questionId] = Object.keys(options);
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

    const variant = getTestSeriesVariant(test.isAdvancedFormat);
    return buildCreatedAttempt(variant, test.id, attempt.id, {
        legacyAttemptId: attempt.id,
    });
}

export async function createV2AssessmentAttempt(
    userId: string,
    examId: string,
    clientOffsetMs?: number,
): Promise<CreatedAssessmentAttempt> {
    const exam = await prisma.examV2.findUnique({
        where: { id: examId },
        select: { id: true, durationMinutes: true, isActive: true },
    });

    if (!exam || !exam.isActive) {
        throw new AssessmentAttemptError(404, "Exam not found or inactive");
    }

    const now = Date.now();
    const scheduledEndAt = new Date(now + exam.durationMinutes * 60 * 1000);

    const attempt = await prisma.examV2Attempt.create({
        data: {
            userId,
            examId: exam.id,
            scheduledEndAt,
            clientOffsetMs: clientOffsetMs ?? 0,
            lastHeartbeatAt: new Date(now),
        },
        select: {
            id: true,
            examId: true,
            status: true,
            startTimestamp: true,
            scheduledEndAt: true,
            clientOffsetMs: true,
        },
    });

    return buildCreatedAttempt("advancedV2", exam.id, attempt.id, {
        v2Attempt: attempt,
    });
}

export async function createAssessmentAttempt(args: {
    userId: string;
    variant: AssessmentVariant;
    assessmentId: string;
    clientOffsetMs?: number;
}): Promise<CreatedAssessmentAttempt> {
    if (args.variant === "advancedV2") {
        return createV2AssessmentAttempt(args.userId, args.assessmentId, args.clientOffsetMs);
    }

    return createLegacyAssessmentAttempt(args.userId, args.assessmentId);
}

export async function deleteAssessmentAttempt(attemptId: string): Promise<DeletedAssessmentAttempt> {
    const legacyAttempt = await prisma.studentAttempt.findUnique({
        where: { id: attemptId },
        select: {
            id: true,
            studentId: true,
            testId: true,
            status: true,
            overallScore: true,
            test: {
                select: {
                    isAdvancedFormat: true,
                },
            },
        },
    });

    if (legacyAttempt) {
        await prisma.studentAttempt.delete({ where: { id: attemptId } });
        return {
            attemptId: legacyAttempt.id,
            variant: getTestSeriesVariant(legacyAttempt.test.isAdvancedFormat),
            assessmentId: legacyAttempt.testId,
            userId: legacyAttempt.studentId,
            status: legacyAttempt.status,
            score: legacyAttempt.overallScore,
        };
    }

    const v2Attempt = await prisma.examV2Attempt.findUnique({
        where: { id: attemptId },
        select: {
            id: true,
            userId: true,
            examId: true,
            status: true,
            totalScore: true,
        },
    });

    if (!v2Attempt) {
        throw new AssessmentAttemptError(404, "Attempt not found");
    }

    await prisma.examV2Attempt.delete({ where: { id: attemptId } });
    return {
        attemptId: v2Attempt.id,
        variant: "advancedV2",
        assessmentId: v2Attempt.examId,
        userId: v2Attempt.userId,
        status: v2Attempt.status,
        score: v2Attempt.totalScore,
    };
}
