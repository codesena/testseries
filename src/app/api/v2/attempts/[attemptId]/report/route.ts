import { isAdminUsername } from "@/server/admin";
import { getAuthUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { evaluateWithDynamicScheme } from "@/server/exam-v2/evaluate";
import { json } from "@/server/json";
import { extractQuestionOrderFromPayload } from "@/lib/examV2QuestionOrder";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({
    attemptId: z.string().uuid(),
});

function normalizeDisplayText(value: string) {
    let s = value.trim();

    // Remove hidden C0 control chars that may show as square placeholders in UI.
    s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        s = s.slice(1, -1).trim();
    }

    s = s.replace(/\u000c/g, "\\f");
    s = s.replace(/\t/g, "\\t");
    s = s.replace(/\"/g, '"');
    s = s.replace(/\\'/g, "'");

    const dollarCount = (s.match(/\$/g) ?? []).length;
    if (dollarCount % 2 === 1) {
        s = s.replace(/\$/g, "\\$");
    }

    return s.trim();
}

function normalizeMaybeText(value: unknown): string {
    return typeof value === "string" ? normalizeDisplayText(value) : "";
}

function extractCorrectAnswer(question: {
    questionType: "SINGLE_CORRECT" | "MULTI_CORRECT" | "MATCHING_LIST" | "NAT_INTEGER" | "NAT_DECIMAL";
    payload: unknown;
    options: Array<{ optionKey: string; isCorrect: boolean | null }>;
}) {
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

function extractTopicNameFromPayload(payload: unknown): string | null {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const obj = payload as Record<string, unknown>;
    const raw = obj.topicName ?? obj.topic ?? obj.Topic ?? obj.chapter ?? obj.chapterName;
    if (typeof raw !== "string") return null;
    const next = raw.trim();
    return next.length ? next : null;
}

export async function GET(
    _req: Request,
    ctx: { params: Promise<{ attemptId: string }> },
) {
    const auth = await getAuthUser();
    if (!auth) {
        return json({ error: "Unauthorized" }, { status: 401 });
    }
    const isAdmin = isAdminUsername(auth.username);

    const params = ParamsSchema.safeParse(await ctx.params);
    if (!params.success) {
        return json({ error: "Invalid attempt id" }, { status: 400 });
    }

    const attempt = await prisma.examV2Attempt.findFirst({
        where: {
            id: params.data.attemptId,
            ...(isAdmin ? {} : { userId: auth.userId }),
        },
        select: {
            id: true,
            user: { select: { name: true } },
            status: true,
            startTimestamp: true,
            scheduledEndAt: true,
            submittedAt: true,
            totalScore: true,
            exam: {
                select: {
                    id: true,
                    code: true,
                    title: true,
                    durationMinutes: true,
                    subjects: {
                        orderBy: { sortOrder: "asc" },
                        select: {
                            subject: true,
                            sortOrder: true,
                            sections: {
                                orderBy: [{ sectionCode: "asc" }, { sortOrder: "asc" }],
                                select: {
                                    id: true,
                                    sectionCode: true,
                                    title: true,
                                    sortOrder: true,
                                    blocks: {
                                        orderBy: { sortOrder: "asc" },
                                        select: {
                                            questions: {
                                                orderBy: { createdAt: "asc" },
                                                select: {
                                                    id: true,
                                                    questionType: true,
                                                    stemRich: true,
                                                    stemAssets: true,
                                                    payload: true,
                                                    createdAt: true,
                                                    options: {
                                                        orderBy: { sortOrder: "asc" },
                                                        select: {
                                                            optionKey: true,
                                                            labelRich: true,
                                                            sortOrder: true,
                                                            isCorrect: true,
                                                            assets: true,
                                                        },
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
                    marksAwarded: true,
                    evaluatedAt: true,
                },
            },
        },
    });

    if (!attempt) {
        return json({ error: "Attempt not found" }, { status: 404 });
    }

    const responseByQuestionId = new Map(
        attempt.responses.map((res) => [res.questionId, res] as const),
    );

    let computedTotalScore = 0;
    let timeOnCorrectSeconds = 0;
    let timeOnIncorrectSeconds = 0;
    const topicAgg: Record<string, { correct: number; total: number }> = {};
    const perQuestion: Array<{
        questionId: string;
        subject: string;
        sectionCode: string;
        sectionTitle: string;
        questionType: "SINGLE_CORRECT" | "MULTI_CORRECT" | "MATCHING_LIST" | "NAT_INTEGER" | "NAT_DECIMAL";
        attempted: boolean;
        correct: boolean;
        marksAwarded: number;
        timeSpentSeconds: number;
        answerState: string;
        marksSchemeName: string | null;
    }> = [];

    const subjectBreakdown = attempt.exam.subjects.map((subjectRow) => {
        let subjectScore = 0;
        let subjectAttempted = 0;
        let subjectCorrect = 0;
        let subjectIncorrect = 0;
        let subjectUnattempted = 0;
        let subjectTimeSpent = 0;
        let subjectNetNegative = 0;

        const sections = subjectRow.sections.map((sectionRow) => {
            let sectionScore = 0;
            let sectionAttempted = 0;
            let sectionCorrect = 0;
            let sectionIncorrect = 0;
            let sectionUnattempted = 0;
            let sectionTimeSpent = 0;
            let sectionNetNegative = 0;

            const orderedQuestions = sectionRow.blocks
                .flatMap((block) => block.questions)
                .sort((a, b) => {
                    const ao = extractQuestionOrderFromPayload(a.payload);
                    const bo = extractQuestionOrderFromPayload(b.payload);
                    if (ao != null && bo != null && ao !== bo) return ao - bo;
                    if (ao != null && bo == null) return -1;
                    if (ao == null && bo != null) return 1;
                    const byCreated = a.createdAt.getTime() - b.createdAt.getTime();
                    if (byCreated !== 0) return byCreated;
                    return a.id.localeCompare(b.id);
                });

            const questions = orderedQuestions.map((question) => {
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

                const computedMarks = question.marksScheme
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

                const marks = response?.marksAwarded ?? computedMarks;
                const attempted = response
                    ? response.answerState === "ANSWERED_SAVED" ||
                    response.answerState === "MARKED_FOR_REVIEW" ||
                    response.answerState === "ANSWERED_MARKED_FOR_REVIEW"
                    : false;

                sectionScore += marks;
                sectionTimeSpent += response?.timeSpentSeconds ?? 0;
                if (marks < 0) sectionNetNegative += Math.abs(marks);
                if (attempted) {
                    sectionAttempted += 1;
                    if (marks > 0) sectionCorrect += 1;
                    else sectionIncorrect += 1;
                } else {
                    sectionUnattempted += 1;
                }

                const topicKey = `${subjectRow.subject} - ${sectionRow.sectionCode}: ${sectionRow.title}`;
                topicAgg[topicKey] ??= { correct: 0, total: 0 };
                topicAgg[topicKey].total += 1;
                if (attempted && marks > 0) topicAgg[topicKey].correct += 1;

                if (attempted && marks > 0) timeOnCorrectSeconds += response?.timeSpentSeconds ?? 0;
                else if (attempted) timeOnIncorrectSeconds += response?.timeSpentSeconds ?? 0;

                perQuestion.push({
                    questionId: question.id,
                    subject: subjectRow.subject,
                    sectionCode: sectionRow.sectionCode,
                    sectionTitle: sectionRow.title,
                    questionType: question.questionType,
                    attempted,
                    correct: attempted && marks > 0,
                    marksAwarded: marks,
                    timeSpentSeconds: response?.timeSpentSeconds ?? 0,
                    answerState: response?.answerState ?? "NOT_VISITED",
                    marksSchemeName: question.marksScheme?.name ?? null,
                });

                return {
                    questionId: question.id,
                    questionType: question.questionType,
                    stemRich: normalizeDisplayText(question.stemRich),
                    stemAssets: question.stemAssets,
                    topicName: extractTopicNameFromPayload(question.payload),
                    options: question.options.map((opt) => ({
                        ...opt,
                        labelRich: normalizeMaybeText(opt.labelRich),
                    })),
                    answerState: response?.answerState ?? "NOT_VISITED",
                    responseJson: response?.responseJson ?? null,
                    numericValue: response?.numericValue != null ? Number(response.numericValue) : null,
                    correctAnswer,
                    marksAwarded: marks,
                    attempted,
                    timeSpentSeconds: response?.timeSpentSeconds ?? 0,
                    evaluatedAt: response?.evaluatedAt ?? null,
                    marksScheme: question.marksScheme
                        ? {
                            id: question.marksScheme.id,
                            name: question.marksScheme.name,
                        }
                        : null,
                };
            });

            subjectScore += sectionScore;
            subjectAttempted += sectionAttempted;
            subjectCorrect += sectionCorrect;
            subjectIncorrect += sectionIncorrect;
            subjectUnattempted += sectionUnattempted;
            subjectTimeSpent += sectionTimeSpent;
            subjectNetNegative += sectionNetNegative;

            return {
                sectionId: sectionRow.id,
                sectionCode: sectionRow.sectionCode,
                title: sectionRow.title,
                sortOrder: sectionRow.sortOrder,
                score: sectionScore,
                attempted: sectionAttempted,
                correct: sectionCorrect,
                incorrect: sectionIncorrect,
                unattempted: sectionUnattempted,
                timeSpentSeconds: sectionTimeSpent,
                netNegative: sectionNetNegative,
                questions,
            };
        });

        computedTotalScore += subjectScore;

        return {
            subject: subjectRow.subject,
            sortOrder: subjectRow.sortOrder,
            score: subjectScore,
            attempted: subjectAttempted,
            correct: subjectCorrect,
            incorrect: subjectIncorrect,
            unattempted: subjectUnattempted,
            timeSpentSeconds: subjectTimeSpent,
            netNegative: subjectNetNegative,
            sections,
        };
    });

    const questionCount = subjectBreakdown.reduce(
        (acc, sub) =>
            acc +
            sub.sections.reduce((sectionAcc, sec) => sectionAcc + sec.questions.length, 0),
        0,
    );

    const attemptedCount = subjectBreakdown.reduce((acc, sub) => acc + sub.attempted, 0);
    const correctCount = subjectBreakdown.reduce((acc, sub) => acc + sub.correct, 0);
    const incorrectCount = subjectBreakdown.reduce((acc, sub) => acc + sub.incorrect, 0);
    const unattemptedCount = subjectBreakdown.reduce((acc, sub) => acc + sub.unattempted, 0);
    const totalTimeSpentSeconds = subjectBreakdown.reduce((acc, sub) => acc + sub.timeSpentSeconds, 0);
    const topicAccuracy = Object.entries(topicAgg)
        .map(([topic, v]) => ({
            topic,
            accuracy: v.total === 0 ? 0 : v.correct / v.total,
            correct: v.correct,
            total: v.total,
        }))
        .sort((a, b) => a.accuracy - b.accuracy);

    const subjectSummary = Object.fromEntries(
        subjectBreakdown.map((sub) => [sub.subject, {
            totalTimeSeconds: sub.timeSpentSeconds,
            correct: sub.correct,
            incorrect: sub.incorrect,
            unattempted: sub.unattempted,
            netScore: sub.score,
            netNegative: sub.netNegative,
        }]),
    );

    return json({
        attempt: {
            id: attempt.id,
            studentName: attempt.user.name,
            status: attempt.status,
            startTimestamp: attempt.startTimestamp,
            scheduledEndAt: attempt.scheduledEndAt,
            submittedAt: attempt.submittedAt,
            totalScore: attempt.totalScore ?? computedTotalScore,
        },
        exam: {
            id: attempt.exam.id,
            code: attempt.exam.code,
            title: attempt.exam.title,
            durationMinutes: attempt.exam.durationMinutes,
        },
        summary: {
            totalQuestions: questionCount,
            attempted: attemptedCount,
            correct: correctCount,
            incorrect: incorrectCount,
            unattempted: unattemptedCount,
            totalTimeSpentSeconds,
            computedTotalScore,
            persistedTotalScore: attempt.totalScore,
        },
        analytics: {
            subjectSummary,
            totalTimeSeconds: totalTimeSpentSeconds,
            timeOnCorrectSeconds,
            timeOnIncorrectSeconds,
            topicAccuracy,
            perQuestion,
        },
        subjectBreakdown,
    });
}
