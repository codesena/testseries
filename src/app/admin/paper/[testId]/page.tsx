import { notFound, redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getAuthUser } from "@/server/auth";
import { isAdminUsername } from "@/server/admin";
import { AdminPaperViewerClient } from "../../../../components/admin/AdminPaperViewerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map(String).map((v) => v.trim()).filter(Boolean);
}

function coerceQuestionOptions(value: unknown): Array<{ key: string; text: string; imageUrl: string | null }> {
    let parsed = value;

    if (typeof parsed === "string") {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            return [];
        }
    }

    if (Array.isArray(parsed)) {
        const out: Array<{ key: string; text: string; imageUrl: string | null }> = [];
        for (const item of parsed) {
            if (!item || typeof item !== "object") continue;
            const maybeKey = (item as { key?: unknown }).key;
            if (typeof maybeKey !== "string") continue;
            const maybeText = (item as { text?: unknown }).text;
            const maybeImageUrl = (item as { imageUrl?: unknown }).imageUrl;
            out.push({
                key: maybeKey,
                text: typeof maybeText === "string" ? maybeText : "",
                imageUrl: typeof maybeImageUrl === "string" ? maybeImageUrl.trim() : null,
            });
        }
        return out;
    }

    if (parsed && typeof parsed === "object") {
        return Object.entries(parsed as Record<string, unknown>).map(([key, raw]) => {
            if (typeof raw === "string") {
                return { key, text: raw, imageUrl: null as string | null };
            }

            if (raw && typeof raw === "object") {
                const maybeText = (raw as { text?: unknown }).text;
                const maybeImageUrl = (raw as { imageUrl?: unknown }).imageUrl;
                return {
                    key,
                    text: typeof maybeText === "string" ? maybeText : "",
                    imageUrl: typeof maybeImageUrl === "string" ? maybeImageUrl.trim() : null,
                };
            }

            return { key, text: "", imageUrl: null as string | null };
        });
    }

    return [];
}

export default async function AdminPaperViewPage(
    props: { params: Promise<{ testId: string }> },
) {
    const auth = await getAuthUser();
    if (!auth) redirect("/login");
    if (!isAdminUsername(auth.username)) redirect("/");

    const params = await props.params;

    const test = await prisma.testSeries.findUnique({
        where: { id: params.testId },
        select: {
            id: true,
            title: true,
            questions: {
                orderBy: { orderIndex: "asc" },
                select: {
                    orderIndex: true,
                    question: {
                        select: {
                            id: true,
                            topicName: true,
                            questionText: true,
                            imageUrls: true,
                            options: true,
                            correctAnswer: true,
                            markingSchemeType: true,
                            subject: { select: { name: true } },
                        },
                    },
                },
            },
        },
    });

    if (!test) notFound();

    const questionIds = test.questions.map((item) => item.question.id);
    const [studentIssueRows, adminIssueRows] = await Promise.all([
        questionIds.length
            ? prisma.questionIssueReport.findMany({
                where: { questionId: { in: questionIds } },
                select: { questionId: true },
            })
            : Promise.resolve([]),
        questionIds.length
            ? (prisma as any).adminQuestionIssueReport.findMany({
                where: { questionId: { in: questionIds } },
                select: { questionId: true },
            })
            : Promise.resolve([]),
    ]);

    const issueCountByQuestionId = new Map<string, number>();
    for (const row of studentIssueRows) {
        issueCountByQuestionId.set(row.questionId, (issueCountByQuestionId.get(row.questionId) ?? 0) + 1);
    }
    for (const row of adminIssueRows) {
        issueCountByQuestionId.set(row.questionId, (issueCountByQuestionId.get(row.questionId) ?? 0) + 1);
    }

    const questions = test.questions.map((item, idx) => ({
        id: item.question.id,
        index: idx + 1,
        subjectName: item.question.subject.name,
        topicName: item.question.topicName,
        questionText: item.question.questionText,
        imageUrls: asStringArray(item.question.imageUrls),
        options: coerceQuestionOptions(item.question.options),
        markingSchemeType: item.question.markingSchemeType,
        correctAnswer: item.question.correctAnswer,
        issueCount: issueCountByQuestionId.get(item.question.id) ?? 0,
    }));

    return (
        <AdminPaperViewerClient
            testTitle={test.title}
            questions={questions}
        />
    );
}
