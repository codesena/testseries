import { getAuthUserId } from "@/server/auth";
import { prisma } from "@/server/db";
import { evaluateWithDynamicScheme } from "@/server/exam-v2/evaluate";
import { json } from "@/server/json";
import { Prisma } from "@prisma/client";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({
    attemptId: z.string().uuid(),
});

function extractCorrectAnswer(question: {
    questionType: "SINGLE_CORRECT" | "MULTI_CORRECT" | "MATCHING_LIST" | "NAT_INTEGER" | "NAT_DECIMAL";
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

export async function POST(
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
            status: true,
            scheduledEndAt: true,
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
        return json({ error: "Attempt not found" }, { status: 404 });
    }

    if (attempt.status !== "IN_PROGRESS") {
        return json({ error: "Attempt already submitted" }, { status: 409 });
    }

    const now = new Date();
    const finalStatus = now > attempt.scheduledEndAt ? "AUTO_SUBMITTED" : "SUBMITTED";

    const questions = attempt.exam.subjects.flatMap((s) =>
        s.sections.flatMap((sec) => sec.blocks.flatMap((b) => b.questions)),
    );

    const responseByQuestionId = new Map(
        attempt.responses.map((res) => [res.questionId, res] as const),
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

        const marks = question.marksScheme
            ? evaluateWithDynamicScheme({
                questionType: question.questionType,
                userAnswer,
                correctAnswer,
                scheme: {
                    questionType: question.marksScheme.questionType,
                    unattemptedScore: question.marksScheme.unattemptedScore,
                    rules: question.marksScheme.rules,
                },
            })
            : 0;

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
                evaluatedAt: now,
                lastUpdated: now,
            },
            create: {
                attemptId: attempt.id,
                questionId: question.id,
                responseJson: Prisma.JsonNull,
                answerState: "NOT_VISITED",
                timeSpentSeconds: 0,
                marksAwarded: marks,
                evaluatedAt: now,
                lastUpdated: now,
            },
        });
    }

    await prisma.examV2Attempt.update({
        where: { id: attempt.id },
        data: {
            status: finalStatus,
            submittedAt: now,
            totalScore,
        },
    });

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
                evaluatedAt: now.toISOString(),
            } as Prisma.InputJsonValue,
        },
        create: {
            attemptId: attempt.id,
            clientEventId: "server-submit",
            eventType: "SUBMIT",
            payload: {
                status: finalStatus,
                totalScore,
                evaluatedAt: now.toISOString(),
            } as Prisma.InputJsonValue,
        },
    });

    return json({
        ok: true,
        attemptId: attempt.id,
        status: finalStatus,
        totalScore,
        evaluatedQuestions: questions.length,
    });
}
