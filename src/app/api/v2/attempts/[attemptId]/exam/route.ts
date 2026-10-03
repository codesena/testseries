import { getAuthUserId } from "@/server/auth";
import { prisma } from "@/server/db";
import { finalizeExamV2Attempt } from "@/server/exam-v2/attempt-finalize";
import { json } from "@/server/json";
import { extractQuestionOrderFromPayload } from "@/lib/examV2QuestionOrder";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ attemptId: z.string().uuid() });

function normalizeDisplayText(value: string): string {
    let text = value.trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
        text = text.slice(1, -1).trim();
    }
    text = text.replace(/\u000c/g, "\\f").replace(/\t/g, "\\t");
    text = text.replace(/\\n(?=[A-Z0-9([\[]|$)/g, "\n").replace(/\\"/g, '"').replace(/\\'/g, "'");
    if ((text.match(/\$/g) ?? []).length % 2 === 1) text = text.replace(/\$/g, "\\$");
    return text.trim();
}

function extractTopicName(payload: unknown): string | null {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const data = payload as Record<string, unknown>;
    const value = data.topicName ?? data.topic ?? data.Topic ?? data.chapter ?? data.chapterName;
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET(
    _req: Request,
    ctx: { params: Promise<{ attemptId: string }> },
) {
    const userId = await getAuthUserId();
    if (!userId) return json({ error: "Unauthorized" }, { status: 401 });

    const params = ParamsSchema.safeParse(await ctx.params);
    if (!params.success) return json({ error: "Invalid attempt id" }, { status: 400 });

    const attempt = await prisma.examV2Attempt.findFirst({
        where: { id: params.data.attemptId, userId },
        select: {
            id: true,
            status: true,
            scheduledEndAt: true,
            exam: {
                select: {
                    title: true,
                    subjects: {
                        orderBy: { sortOrder: "asc" },
                        select: {
                            subject: true,
                            sections: {
                                orderBy: [{ sectionCode: "asc" }, { sortOrder: "asc" }],
                                select: {
                                    sectionCode: true,
                                    title: true,
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
                                                            assets: true,
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

    if (!attempt) return json({ error: "Attempt not found" }, { status: 404 });

    let status = attempt.status;
    if (status === "IN_PROGRESS" && new Date() > attempt.scheduledEndAt) {
        await finalizeExamV2Attempt(prisma, attempt.id, {
            status: "AUTO_SUBMITTED",
            now: new Date(),
        });
        const refreshed = await prisma.examV2Attempt.findUnique({
            where: { id: attempt.id },
            select: { status: true },
        });
        status = refreshed?.status ?? "AUTO_SUBMITTED";
    }

    const responseByQuestionId = new Map(attempt.responses.map((response) => [response.questionId, response] as const));
    const subjectBreakdown = attempt.exam.subjects.map((subjectRow) => ({
        subject: subjectRow.subject,
        sections: subjectRow.sections.map((sectionRow) => {
            const orderedQuestions = sectionRow.blocks
                .flatMap((block) => block.questions)
                .sort((left, right) => {
                    const leftOrder = extractQuestionOrderFromPayload(left.payload);
                    const rightOrder = extractQuestionOrderFromPayload(right.payload);
                    if (leftOrder != null && rightOrder != null && leftOrder !== rightOrder) return leftOrder - rightOrder;
                    if (leftOrder != null && rightOrder == null) return -1;
                    if (leftOrder == null && rightOrder != null) return 1;
                    const byCreatedAt = left.createdAt.getTime() - right.createdAt.getTime();
                    return byCreatedAt || left.id.localeCompare(right.id);
                });

            return {
                sectionCode: sectionRow.sectionCode,
                title: sectionRow.title,
                questions: orderedQuestions.map((question) => {
                    const response = responseByQuestionId.get(question.id);
                    return {
                        questionId: question.id,
                        questionType: question.questionType,
                        stemRich: normalizeDisplayText(question.stemRich),
                        stemAssets: question.stemAssets,
                        topicName: extractTopicName(question.payload),
                        options: question.options.map((option) => ({
                            optionKey: option.optionKey,
                            labelRich: normalizeDisplayText(option.labelRich),
                            assets: option.assets,
                        })),
                        responseJson: response?.responseJson ?? null,
                        numericValue: response?.numericValue != null ? Number(response.numericValue) : null,
                        answerState: response?.answerState ?? "NOT_VISITED",
                        timeSpentSeconds: response?.timeSpentSeconds ?? 0,
                    };
                }),
            };
        }),
    }));

    return json({
        attempt: {
            id: attempt.id,
            status,
            scheduledEndAt: attempt.scheduledEndAt,
        },
        exam: { title: attempt.exam.title },
        subjectBreakdown,
    });
}
