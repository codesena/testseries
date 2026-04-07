import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/server/db";
import { evaluateWithDynamicScheme } from "../src/server/exam-v2/evaluate";

type QuestionType = "SINGLE_CORRECT" | "MULTI_CORRECT" | "MATCHING_LIST" | "NAT_INTEGER" | "NAT_DECIMAL";

function parseArgs(argv: string[]) {
    let attemptId = "";

    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === "--attemptId" && argv[i + 1]) {
            attemptId = argv[i + 1].trim();
            i += 1;
        }
    }

    if (!attemptId) throw new Error("--attemptId is required");
    return { attemptId };
}

function isUuidLike(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function resolveAttemptId(prefixOrId: string): Promise<string> {
    if (isUuidLike(prefixOrId)) return prefixOrId;

    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id::text AS id
        FROM "ExamV2Attempts"
        WHERE id::text LIKE ${`${prefixOrId}%`}
        ORDER BY "startTimestamp" DESC
        LIMIT 2
    `;

    if (rows.length === 0) throw new Error(`No ExamV2Attempt found for prefix: ${prefixOrId}`);
    if (rows.length > 1) throw new Error(`Ambiguous attempt prefix: ${prefixOrId}. Please provide a longer id.`);

    return rows[0].id;
}

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
                { ruleKind: "FULL" as const, priority: 1, score: 3, requireAllCorrect: true, requireZeroIncorrect: true },
                { ruleKind: "NEGATIVE" as const, priority: 2, score: -1, minIncorrectSelected: 1 },
            ],
        };
    }

    if (questionType === "MATCHING_LIST") {
        return {
            name: "V2_ADV_MATCH_3N0",
            questionType,
            unattemptedScore: 0,
            rules: [
                { ruleKind: "FULL" as const, priority: 1, score: 3, requireAllCorrect: true, requireZeroIncorrect: true },
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
                { ruleKind: "FULL" as const, priority: 1, score: 3, requireAllCorrect: true, requireZeroIncorrect: true },
            ],
        };
    }

    return {
        name: "V2_ADV_NAT_INTEGER_4N0",
        questionType,
        unattemptedScore: 0,
        rules: [
            { ruleKind: "FULL" as const, priority: 1, score: 4, requireAllCorrect: true, requireZeroIncorrect: true },
        ],
    };
}

function shouldUseFallback(questionType: QuestionType, schemeName: string) {
    if (questionType === "SINGLE_CORRECT") return schemeName !== "V2_ADV_SINGLE_3N1";
    if (questionType === "MATCHING_LIST") return schemeName !== "V2_ADV_MATCH_3N0";
    if (questionType === "NAT_DECIMAL") return schemeName !== "V2_ADV_NAT_DECIMAL_3N0";
    if (questionType === "NAT_INTEGER") return schemeName !== "V2_ADV_NAT_INTEGER_4N0";
    return false;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const attemptId = await resolveAttemptId(args.attemptId);

    const attempt = await prisma.examV2Attempt.findUnique({
        where: { id: attemptId },
        select: {
            id: true,
            userId: true,
            status: true,
            totalScore: true,
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
                                                    options: { select: { optionKey: true, isCorrect: true } },
                                                    marksScheme: {
                                                        select: {
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
                },
            },
        },
    });

    if (!attempt) throw new Error(`Attempt not found: ${attemptId}`);

    const questions = attempt.exam.subjects.flatMap((s) =>
        s.sections.flatMap((sec) => sec.blocks.flatMap((b) => b.questions)),
    );

    const responseByQuestionId = new Map(attempt.responses.map((r) => [r.questionId, r] as const));

    let totalScore = 0;
    const now = new Date();

    await prisma.$transaction(async (tx) => {
        for (const q of questions) {
            const response = responseByQuestionId.get(q.id);

            const userAnswer =
                q.questionType === "NAT_INTEGER" || q.questionType === "NAT_DECIMAL"
                    ? (response?.numericValue != null ? Number(response.numericValue) : response?.responseJson)
                    : response?.responseJson;

            const correctAnswer = extractCorrectAnswer({
                questionType: q.questionType,
                payload: q.payload,
                options: q.options,
            });

            const scoringScheme = q.marksScheme && !shouldUseFallback(q.questionType, q.marksScheme.name)
                ? {
                    name: q.marksScheme.name,
                    questionType: q.marksScheme.questionType,
                    unattemptedScore: q.marksScheme.unattemptedScore,
                    rules: q.marksScheme.rules,
                }
                : fallbackSchemeForQuestionType(q.questionType);

            const marks = evaluateWithDynamicScheme({
                questionType: q.questionType,
                userAnswer,
                correctAnswer,
                scheme: scoringScheme,
            });

            totalScore += marks;

            await tx.examV2Response.upsert({
                where: { attemptId_questionId: { attemptId: attempt.id, questionId: q.id } },
                update: {
                    marksAwarded: marks,
                    evaluatedAt: now,
                    lastUpdated: now,
                },
                create: {
                    attemptId: attempt.id,
                    questionId: q.id,
                    responseJson: Prisma.JsonNull,
                    answerState: "NOT_VISITED",
                    timeSpentSeconds: 0,
                    marksAwarded: marks,
                    evaluatedAt: now,
                    lastUpdated: now,
                },
            });
        }

        await tx.examV2Attempt.update({
            where: { id: attempt.id },
            data: { totalScore },
        });
    });

    console.log(
        JSON.stringify(
            {
                ok: true,
                attemptId: attempt.id,
                status: attempt.status,
                previousTotalScore: attempt.totalScore,
                recomputedTotalScore: totalScore,
                evaluatedQuestions: questions.length,
                evaluatedAt: now.toISOString(),
            },
            null,
            2,
        ),
    );
}

main()
    .catch((err) => {
        console.error("Recompute failed:", err instanceof Error ? err.message : err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
