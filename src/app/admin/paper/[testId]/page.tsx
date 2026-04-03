import Link from "next/link";
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
        <div className="min-h-screen flex flex-col">
            <header
                className="sticky top-0 z-50 border-b backdrop-blur-md"
                style={{
                    borderColor: "var(--border)",
                    background: "color-mix(in srgb, var(--background) 88%, transparent)",
                }}
            >
                <div className="max-w-5xl mx-auto px-4 py-2">
                    <div className="rounded-2xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0 flex items-center gap-2">
                                <div
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold shrink-0"
                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                >
                                    A
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[clamp(1.2rem,2.2vw,1.5rem)] font-semibold leading-none">Admin Panel</div>
                                    <div className="hidden sm:block text-[11px] leading-tight" style={{ color: "var(--foreground)", opacity: 0.8 }}>
                                        Candidate reports and issue monitoring
                                    </div>
                                </div>
                            </div>

                            <div className="grid w-full min-w-0 grid-cols-4 gap-2 sm:flex sm:w-auto sm:min-w-0 sm:items-center sm:gap-2 sm:overflow-x-auto sm:whitespace-nowrap sm:pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                                <Link
                                    href="/"
                                    className="inline-flex w-full sm:w-auto sm:shrink-0 items-center justify-center h-9 rounded-full border px-2 sm:px-3 text-[11px] sm:text-xs whitespace-nowrap ui-click"
                                    style={{ borderColor: "var(--border)", background: "transparent" }}
                                >
                                    <span className="mr-1 hidden sm:inline-flex" aria-hidden>
                                        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M3 9.5L10 4l7 5.5" />
                                            <path d="M5.5 8.8V16h9V8.8" />
                                        </svg>
                                    </span>
                                    Home
                                </Link>
                                <Link
                                    href="/admin"
                                    className="inline-flex w-full sm:w-auto sm:shrink-0 items-center justify-center h-9 rounded-full border px-2 sm:px-3 text-[11px] sm:text-xs whitespace-nowrap ui-click"
                                    style={{
                                        borderColor: "rgba(59, 130, 246, 0.5)",
                                        background: "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(14,165,233,0.9))",
                                        color: "#e0f2fe",
                                    }}
                                >
                                    <span className="mr-1 hidden sm:inline-flex" aria-hidden>
                                        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M4.5 15.5h11" />
                                            <circle cx="7" cy="8" r="1.5" />
                                            <circle cx="13" cy="8" r="1.5" />
                                        </svg>
                                    </span>
                                    Candidates
                                </Link>
                                <Link
                                    href="/admin/consolidated"
                                    className="inline-flex w-full sm:w-auto sm:shrink-0 items-center justify-center h-9 rounded-full border px-2 sm:px-3 text-[11px] sm:text-xs whitespace-nowrap ui-click"
                                    style={{ borderColor: "var(--border)", background: "transparent" }}
                                >
                                    <span className="mr-1 hidden sm:inline-flex" aria-hidden>
                                        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M4 15h12" />
                                            <path d="M6 13V9" />
                                            <path d="M10 13V6" />
                                            <path d="M14 13V10" />
                                        </svg>
                                    </span>
                                    Consolidated
                                </Link>
                                <Link
                                    href="/admin/issues"
                                    className="inline-flex w-full sm:w-auto sm:shrink-0 items-center justify-center h-9 rounded-full border px-2 sm:px-3 text-[11px] sm:text-xs whitespace-nowrap ui-click"
                                    style={{ borderColor: "var(--border)", background: "transparent" }}
                                >
                                    <span className="mr-1 hidden sm:inline-flex" aria-hidden>
                                        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="10" cy="10" r="7" />
                                            <path d="M10 6.8v4.4" />
                                            <path d="M10 14.5h.01" />
                                        </svg>
                                    </span>
                                    Issues
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto w-full px-4 py-8">
                <AdminPaperViewerClient
                    testTitle={test.title}
                    questions={questions}
                />
            </main>
        </div>
    );
}
