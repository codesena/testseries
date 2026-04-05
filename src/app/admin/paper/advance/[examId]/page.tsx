import { notFound, redirect } from "next/navigation";
import { getAuthUser } from "@/server/auth";
import { isAdminUsername } from "@/server/admin";
import { prisma } from "@/server/db";
import { extractQuestionOrderFromPayload } from "@/lib/examV2QuestionOrder";
import { AdminAdvancedPaperViewerClient } from "@/components/admin/AdminAdvancedPaperViewerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asStringArrayFromAsset(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map(String).map((v) => v.trim()).filter(Boolean);
    }

    if (value && typeof value === "object") {
        const obj = value as Record<string, unknown>;
        const candidates = [obj.urls, obj.imageUrls, obj.images, obj.url, obj.src];
        const out: string[] = [];
        for (const c of candidates) {
            if (typeof c === "string" && c.trim()) out.push(c.trim());
            if (Array.isArray(c)) {
                for (const item of c) {
                    const s = String(item).trim();
                    if (s) out.push(s);
                }
            }
        }
        return Array.from(new Set(out));
    }

    if (typeof value === "string") {
        const s = value.trim();
        if (!s) return [];
        return s.split(/\r?\n|,|;/g).map((x) => x.trim()).filter(Boolean);
    }

    return [];
}

function extractCorrectAnswer(
    question: {
        questionType: "SINGLE_CORRECT" | "MULTI_CORRECT" | "MATCHING_LIST" | "NAT_INTEGER" | "NAT_DECIMAL";
        payload: unknown;
        options: Array<{ optionKey: string; isCorrect: boolean | null }>;
    },
): unknown {
    if (question.payload && typeof question.payload === "object" && !Array.isArray(question.payload)) {
        const maybe = (question.payload as Record<string, unknown>).correctAnswer;
        if (maybe !== undefined) return maybe;
    }

    const correctKeys = question.options.filter((opt) => Boolean(opt.isCorrect)).map((opt) => opt.optionKey);

    if (question.questionType === "MULTI_CORRECT") return correctKeys;
    if (question.questionType === "SINGLE_CORRECT" || question.questionType === "MATCHING_LIST") return correctKeys[0] ?? "";
    return null;
}

function extractTopicName(payload: unknown): string | null {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const obj = payload as Record<string, unknown>;
    const raw = obj.topicName ?? obj.topic ?? obj.Topic ?? obj.chapter ?? obj.chapterName;
    if (typeof raw !== "string") return null;
    const next = raw.trim();
    return next.length ? next : null;
}

export default async function AdminAdvancedPaperViewPage(
    props: { params: Promise<{ examId: string }> },
) {
    const auth = await getAuthUser();
    if (!auth) redirect("/login");
    if (!isAdminUsername(auth.username)) redirect("/");

    const params = await props.params;

    const exam = await prisma.examV2.findUnique({
        where: { id: params.examId },
        select: {
            id: true,
            title: true,
            code: true,
            durationMinutes: true,
            instructionsRichText: true,
            subjects: {
                orderBy: { sortOrder: "asc" },
                select: {
                    subject: true,
                    sections: {
                        orderBy: { sortOrder: "asc" },
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
                                                    isCorrect: true,
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
    });

    if (!exam) notFound();

    const subjectNameMap: Record<string, string> = {
        PHYSICS: "Physics",
        CHEMISTRY: "Chemistry",
        MATHEMATICS: "Mathematics",
    };

    const questions = exam.subjects
        .flatMap((subject) =>
            subject.sections.flatMap((section) =>
                section.blocks
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
                    })
                    .map((q) => ({
                        id: q.id,
                        subjectName: subjectNameMap[subject.subject] ?? subject.subject,
                        sectionCode: section.sectionCode,
                        sectionTitle: section.title,
                        questionType: q.questionType,
                        questionText: q.stemRich,
                        topicName: extractTopicName(q.payload),
                        imageUrls: asStringArrayFromAsset(q.stemAssets),
                        options: q.options.map((o) => ({
                            key: o.optionKey,
                            text: o.labelRich,
                            imageUrl: asStringArrayFromAsset(o.assets).join("\n") || null,
                        })),
                        correctAnswer: extractCorrectAnswer({
                            questionType: q.questionType,
                            payload: q.payload,
                            options: q.options,
                        }),
                    })),
            ),
        )
        .map((q, idx) => ({ ...q, index: idx + 1 }));

    return (
        <AdminAdvancedPaperViewerClient
            examId={exam.id}
            examTitle={exam.title}
            examCode={exam.code}
            durationMinutes={exam.durationMinutes}
            examInstructions={exam.instructionsRichText}
            questions={questions}
        />
    );
}
