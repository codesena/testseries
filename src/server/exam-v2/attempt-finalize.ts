import { Prisma, type PrismaClient } from "@prisma/client";
import { evaluateWithDynamicScheme } from "@/server/exam-v2/evaluate";

type QuestionType =
    | "SINGLE_CORRECT"
    | "MULTI_CORRECT"
    | "MATCHING_LIST"
    | "NAT_INTEGER"
    | "NAT_DECIMAL";

type FinalAttemptStatus = "SUBMITTED" | "AUTO_SUBMITTED";

function extractCorrectAnswer(question: {
    questionType: QuestionType;
    payload: unknown;
    options: Array<{ optionKey: string; isCorrect: boolean | null }>;
}): unknown {
    if (question.payload && typeof question.payload === "object" && !Array.isArray(question.payload)) {
        const maybe = (question.payload as Record<string, unknown>).correctAnswer;
        if (maybe !== undefined) return maybe;
    }

    const correctKeys = question.options
        .filter((opt) => Boolean(opt.isCorrect))
        .map((opt) => opt.optionKey);

    if (question.questionType === "MULTI_CORRECT") return correctKeys;
    if (question.questionType === "SINGLE_CORRECT") return correctKeys[0] ?? "";

    return null;
}

function fallbackSchemeForQuestionType(questionType: QuestionType) {
    if (questionType === "SINGLE_CORRECT") {
        return {
            name: "V2_ADV_SINGLE_3N1",
            questionType,
            unattemptedScore: 0,
            rules: [
                {
                    ruleKind: "FULL" as const,
                    priority: 1,
                    score: 3,
                    requireAllCorrect: true,
                    requireZeroIncorrect: true,
                },
                {
                    ruleKind: "NEGATIVE" as const,
                    priority: 2,
                    score: -1,
                    minIncorrectSelected: 1,
                },
            ],
        };
    }

    if (questionType === "MATCHING_LIST") {
        return {
            name: "V2_ADV_MATCH_3N0",
            questionType,
            unattemptedScore: 0,
            rules: [
                {
                    ruleKind: "FULL" as const,
                    priority: 1,
                    score: 3,
                    requireAllCorrect: true,
                    requireZeroIncorrect: true,
                },
            ],
        };
    }

    if (questionType === "MULTI_CORRECT") {
        return {
            name: "V2_ADV_MULTI_4_3_2_1_N2",
            questionType,
            unattemptedScore: 0,
            rules: [],
        };
    }

    if (questionType === "NAT_DECIMAL") {
        return {
            name: "V2_ADV_NAT_DECIMAL_3N0",
            questionType,
            unattemptedScore: 0,
            rules: [
                {
                    ruleKind: "FULL" as const,
                    priority: 1,
                    score: 3,
                    requireAllCorrect: true,
                    requireZeroIncorrect: true,
                },
            ],
        };
    }

    return {
        name: "V2_ADV_NAT_INTEGER_4N0",
        questionType,
        unattemptedScore: 0,
        rules: [
            {
                ruleKind: "FULL" as const,
                priority: 1,
                score: 4,
                requireAllCorrect: true,
                requireZeroIncorrect: true,
            },
        ],
    };
}

function shouldUseAdvancedFallback(questionType: QuestionType, schemeName: string) {
    if (questionType === "SINGLE_CORRECT" && schemeName === "V2_MAINS_SINGLE_4N1") return true;
    if (questionType === "MATCHING_LIST" && schemeName === "V2_ADV_MATCH_3N1") return true;
    if (questionType === "NAT_DECIMAL" && schemeName === "V2_NAT_STANDARD") return true;
    return false;
}

export async function finalizeExamV2Attempt(
    prisma: PrismaClient,
    attemptId: string,
    options?: {
        status?: FinalAttemptStatus;
        now?: Date;
    },
): Promise<{
    attemptId: string;
    status: FinalAttemptStatus;
    totalScore: number;
    evaluatedQuestions: number;
    submittedAt: Date;
}> {
    const now = options?.now ?? new Date();

    const attempt = await prisma.examV2Attempt.findUnique({
        where: { id: attemptId },
        select: {
            id: true,
            status: true,
            scheduledEndAt: true,
            totalScore: true,
            submittedAt: true,
            exam: {
                select: {
                    subjects: {
                        select: {
                            sections: {
                                select: {
                                    blocks: {
                                        select: {
                                            questions: {
                                                select: {
                                                    id: true,
                                                    questionType: true,
                                                    payload: true,
                                                    options: {
                                                        select: { optionKey: true, isCorrect: true },
                                                    },
                                                    marksScheme: {
                                                        select: {
                                                            id: true,
                                                            name: true,
                                                            questionType: true,
                                                            unattemptedScore: true,
                                                            rules: {
                                                                orderBy: { priority: "asc" },
                                                                select: {
                                                                    ruleKind: true,
                                                                    priority: true,
                                                                    score: true,
                                                                    minCorrectSelected: true,
                                                                    maxCorrectSelected: true,
                                                                    minIncorrectSelected: true,
                                                                    maxIncorrectSelected: true,
                                                                    requireAllCorrect: true,
                                                                    requireZeroIncorrect: true,
                                                                    requireUnattempted: true,
                                                                },
                                                            },
                                                        },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            responses: {
                select: {
                    questionId: true,
                    responseJson: true,
                    numericValue: true,
                    answerState: true,
                    timeSpentSeconds: true,
                },
            },
        },
    });

    if (!attempt) {
        throw new Error(`Attempt not found: ${attemptId}`);
    }

    if (attempt.status !== "IN_PROGRESS") {
        return {
            attemptId: attempt.id,
            status: attempt.status === "AUTO_SUBMITTED" ? "AUTO_SUBMITTED" : "SUBMITTED",
            totalScore: attempt.totalScore ?? 0,
            evaluatedQuestions: attempt.responses.length,
            submittedAt: attempt.submittedAt ?? attempt.scheduledEndAt,
        };
    }

    const finalStatus = options?.status ?? (now > attempt.scheduledEndAt ? "AUTO_SUBMITTED" : "SUBMITTED");
    const submittedAt = finalStatus === "AUTO_SUBMITTED" ? attempt.scheduledEndAt : now;

    const questions = attempt.exam.subjects.flatMap((subject) =>
        subject.sections.flatMap((section) => section.blocks.flatMap((block) => block.questions)),
    );

    const responseByQuestionId = new Map(
        attempt.responses.map((response) => [response.questionId, response] as const),
    );

    let totalScore = 0;
    for (const question of questions) {
        const response = responseByQuestionId.get(question.id);

        const userAnswer =
            question.questionType === "NAT_INTEGER" || question.questionType === "NAT_DECIMAL"
                ? (response?.numericValue != null ? Number(response.numericValue) : response?.responseJson)
                : response?.responseJson;

        const correctAnswer = extractCorrectAnswer({
            questionType: question.questionType,
            payload: question.payload,
            options: question.options,
        });

        const scoringScheme = question.marksScheme &&
            !shouldUseAdvancedFallback(question.questionType, question.marksScheme.name)
            ? {
                name: question.marksScheme.name,
                questionType: question.marksScheme.questionType,
                unattemptedScore: question.marksScheme.unattemptedScore,
                rules: question.marksScheme.rules,
            }
            : fallbackSchemeForQuestionType(question.questionType);

        const marks = evaluateWithDynamicScheme({
            questionType: question.questionType,
            userAnswer,
            correctAnswer,
            scheme: scoringScheme,
        });

        totalScore += marks;

        await prisma.examV2Response.upsert({
            where: {
                attemptId_questionId: {
                    attemptId: attempt.id,
                    questionId: question.id,
                },
            },
            update: {
                marksAwarded: marks,
                evaluatedAt: submittedAt,
                lastUpdated: submittedAt,
            },
            create: {
                attemptId: attempt.id,
                questionId: question.id,
                responseJson: Prisma.JsonNull,
                answerState: "NOT_VISITED",
                timeSpentSeconds: 0,
                marksAwarded: marks,
                evaluatedAt: submittedAt,
                lastUpdated: submittedAt,
            },
        });
    }

    const updated = await prisma.examV2Attempt.updateMany({
        where: { id: attempt.id, status: "IN_PROGRESS" },
        data: {
            status: finalStatus,
            submittedAt,
            totalScore,
        },
    });

    if (updated.count > 0) {
        await prisma.examV2AttemptEvent.upsert({
            where: {
                attemptId_clientEventId: {
                    attemptId: attempt.id,
                    clientEventId: "server-submit",
                },
            },
            update: {
                eventType: "SUBMIT",
                payload: {
                    status: finalStatus,
                    totalScore,
                    evaluatedAt: submittedAt.toISOString(),
                } as Prisma.InputJsonValue,
            },
            create: {
                attemptId: attempt.id,
                clientEventId: "server-submit",
                eventType: "SUBMIT",
                payload: {
                    status: finalStatus,
                    totalScore,
                    evaluatedAt: submittedAt.toISOString(),
                } as Prisma.InputJsonValue,
            },
        });

        return {
            attemptId: attempt.id,
            status: finalStatus,
            totalScore,
            evaluatedQuestions: questions.length,
            submittedAt,
        };
    }

    const currentAttempt = await prisma.examV2Attempt.findUnique({
        where: { id: attempt.id },
        select: {
            status: true,
            totalScore: true,
            submittedAt: true,
        },
    });

    return {
        attemptId: attempt.id,
        status: currentAttempt?.status === "AUTO_SUBMITTED" ? "AUTO_SUBMITTED" : finalStatus,
        totalScore: currentAttempt?.totalScore ?? totalScore,
        evaluatedQuestions: questions.length,
        submittedAt: currentAttempt?.submittedAt ?? submittedAt,
    };
}
