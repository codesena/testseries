import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getAuthUser } from "@/server/auth";
import { isAdminUsername } from "@/server/admin";
import { evaluateResponse } from "@/server/evaluate";
import { ConsolidatedReportView, type ConsolidatedReportData } from "@/components/admin/ConsolidatedReportView";
import { ConsolidatedFilterForm } from "@/components/admin/ConsolidatedFilterForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeDisplayText(value: string) {
    let s = value.trim();

    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        s = s.slice(1, -1).trim();
    }

    s = s.replace(/\u000c/g, "\\f");
    s = s.replace(/\t/g, "\\t");
    s = s.replace(/\\"/g, '"');
    s = s.replace(/\\'/g, "'");

    const dollarCount = (s.match(/\$/g) ?? []).length;
    if (dollarCount % 2 === 1) s = s.replace(/\$/g, "\\$");

    return s.trim();
}

function normalizeMaybeText(value: unknown): string {
    return typeof value === "string" ? normalizeDisplayText(value) : "";
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
                text: normalizeMaybeText(maybeText),
                imageUrl: typeof maybeImageUrl === "string" ? maybeImageUrl.trim() : null,
            });
        }
        return out;
    }

    if (parsed && typeof parsed === "object") {
        return Object.entries(parsed as Record<string, unknown>).map(([key, raw]) => {
            if (typeof raw === "string") {
                return { key, text: normalizeDisplayText(raw), imageUrl: null as string | null };
            }

            if (raw && typeof raw === "object") {
                const maybeText = (raw as { text?: unknown }).text;
                const maybeImageUrl = (raw as { imageUrl?: unknown }).imageUrl;
                return {
                    key,
                    text: normalizeMaybeText(maybeText),
                    imageUrl: typeof maybeImageUrl === "string" ? maybeImageUrl.trim() : null,
                };
            }

            return { key, text: "", imageUrl: null as string | null };
        });
    }

    return [];
}

function isAttemptedAnswer(value: unknown): boolean {
    if (value == null) return false;
    if (typeof value === "string" && value.trim() === "") return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
}

type SearchParams = Record<string, string | string[] | undefined>;

function readAttemptIds(searchParams: SearchParams): string[] {
    const raw = searchParams.attemptIds;

    if (Array.isArray(raw)) {
        return raw.flatMap((x) => x.split(",")).map((x) => x.trim()).filter(Boolean);
    }

    if (typeof raw === "string") {
        return raw.split(",").map((x) => x.trim()).filter(Boolean);
    }

    return [];
}

function fmtDate(d: Date | null): string {
    if (!d) return "-";
    try {
        return new Intl.DateTimeFormat("en-IN", {
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Kolkata",
        }).format(d);
    } catch {
        return d.toISOString();
    }
}

export default async function AdminConsolidatedPage(
    props: { searchParams: Promise<SearchParams> },
) {
    const auth = await getAuthUser();
    if (!auth) redirect("/login");

    if (!isAdminUsername(auth.username)) {
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
                                    </div>
                                </div>
                                <Link
                                    href="/"
                                    className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                    style={{ borderColor: "var(--border)", background: "transparent" }}
                                >
                                    Home
                                </Link>
                            </div>
                        </div>
                    </div>
                </header>

                <main className="max-w-5xl mx-auto w-full px-4 py-8">
                    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                        <div className="text-sm font-medium">Access denied</div>
                        <div className="mt-1 text-sm opacity-70">Your account is not allowed to view admin reports.</div>
                    </div>
                </main>
            </div>
        );
    }

    const searchParams = await props.searchParams;

    const tests = await prisma.testSeries.findMany({
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, createdAt: true },
    });

    const requestedTestId = typeof searchParams.testId === "string" ? searchParams.testId : "";
    const selectedTestId = tests.some((t) => t.id === requestedTestId)
        ? requestedTestId
        : (tests[0]?.id ?? "");

    const attemptsForSelectedTest = selectedTestId
        ? await prisma.studentAttempt.findMany({
            where: { testId: selectedTestId },
            orderBy: { startTimestamp: "desc" },
            take: 300,
            select: {
                id: true,
                studentId: true,
                status: true,
                overallScore: true,
                startTimestamp: true,
                endTimestamp: true,
            },
        })
        : [];

    const studentIdsForChoices = Array.from(new Set(attemptsForSelectedTest.map((a) => a.studentId)));
    const studentsForChoices = studentIdsForChoices.length
        ? await prisma.user.findMany({
            where: { id: { in: studentIdsForChoices } },
            select: { id: true, name: true, username: true },
        })
        : [];
    const studentById = new Map(studentsForChoices.map((s) => [s.id, s] as const));

    const attemptChoices = attemptsForSelectedTest.map((a) => {
        const s = studentById.get(a.studentId);
        return {
            id: a.id,
            studentName: s?.name ?? a.studentId,
            studentUsername: s?.username ?? "unknown",
            status: a.status,
            overallScore: a.overallScore,
            startTimestamp: a.startTimestamp,
            endTimestamp: a.endTimestamp,
        };
    });

    const requestedAttemptIds = readAttemptIds(searchParams);
    const allowedAttemptIds = new Set(attemptChoices.map((a) => a.id));
    const selectedAttemptIds = requestedAttemptIds.filter((id) => allowedAttemptIds.has(id));

    let consolidated: ConsolidatedReportData | null = null;

    if (selectedTestId && selectedAttemptIds.length > 0) {
        const selectedAttemptsRaw = await prisma.studentAttempt.findMany({
            where: { id: { in: selectedAttemptIds }, testId: selectedTestId },
            select: {
                id: true,
                studentId: true,
                status: true,
                overallScore: true,
                startTimestamp: true,
                endTimestamp: true,
                responses: {
                    select: {
                        questionId: true,
                        selectedAnswer: true,
                        timeSpentSeconds: true,
                        paletteStatus: true,
                    },
                },
            },
        });

        const selectedAttemptById = new Map(selectedAttemptsRaw.map((a) => [a.id, a] as const));
        const selectedAttempts = selectedAttemptIds
            .map((id) => selectedAttemptById.get(id))
            .filter((v): v is NonNullable<typeof v> => Boolean(v));

        const selectedStudentIds = Array.from(new Set(selectedAttempts.map((a) => a.studentId)));
        const selectedStudents = selectedStudentIds.length
            ? await prisma.user.findMany({
                where: { id: { in: selectedStudentIds } },
                select: { id: true, name: true, username: true },
            })
            : [];
        const selectedStudentById = new Map(selectedStudents.map((s) => [s.id, s] as const));

        const testOrder = await prisma.testQuestion.findMany({
            where: { testId: selectedTestId },
            orderBy: { orderIndex: "asc" },
            select: { questionId: true },
        });
        const questionOrder = testOrder.map((x) => x.questionId);

        const questions = questionOrder.length
            ? await prisma.question.findMany({
                where: { id: { in: questionOrder } },
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
            })
            : [];
        const questionById = new Map(questions.map((q) => [q.id, q] as const));

        const reflectionRows = await (prisma as any).attemptQuestionReflection.findMany({
            where: {
                attemptId: { in: selectedAttempts.map((a) => a.id) },
            },
            select: {
                attemptId: true,
                questionId: true,
                wrongReason: true,
                leftReason: true,
                slowReason: true,
                updatedAt: true,
            },
        });

        const reflectionByAttemptQuestion = new Map<
            string,
            {
                wrongReason: string | null;
                leftReason: string | null;
                slowReason: string | null;
                savedAt: string;
            }
        >();

        for (const row of reflectionRows) {
            const key = `${row.attemptId}::${row.questionId}`;
            reflectionByAttemptQuestion.set(key, {
                wrongReason: row.wrongReason,
                leftReason: row.leftReason,
                slowReason: row.slowReason,
                savedAt: row.updatedAt.toISOString(),
            });
        }

        consolidated = {
            attempts: selectedAttempts.map((a) => {
                const s = selectedStudentById.get(a.studentId);
                return {
                    id: a.id,
                    studentName: s?.name ?? a.studentId,
                    studentUsername: s?.username ?? "unknown",
                    status: a.status,
                    overallScore: a.overallScore,
                    startTimestamp: a.startTimestamp.toISOString(),
                    endTimestamp: a.endTimestamp ? a.endTimestamp.toISOString() : null,
                };
            }),
            questions: questionOrder.map((qid, idx) => {
                const q = questionById.get(qid);
                if (!q) {
                    return {
                        questionId: qid,
                        index: idx + 1,
                        subjectName: "Unknown",
                        topicName: "Unknown",
                        questionText: "Question not found",
                        imageUrls: null,
                        markingSchemeType: "MAINS_SINGLE",
                        options: [],
                        correctAnswer: null,
                        students: selectedAttempts.map((a) => ({
                            attemptId: a.id,
                            selectedAnswer: null,
                            attempted: false,
                            correct: false,
                            paletteStatus: "NOT_VISITED",
                            timeSpentSeconds: 0,
                            marks: 0,
                            reflection: reflectionByAttemptQuestion.get(`${a.id}::${qid}`) ?? null,
                        })),
                    };
                }

                const parsedOptions = coerceQuestionOptions(q.options);

                return {
                    questionId: qid,
                    index: idx + 1,
                    subjectName: q.subject.name,
                    topicName: normalizeMaybeText(q.topicName) || "Unknown",
                    questionText: normalizeMaybeText(q.questionText),
                    imageUrls: Array.isArray(q.imageUrls) ? (q.imageUrls as unknown[]).map(String) : null,
                    markingSchemeType: q.markingSchemeType,
                    options: parsedOptions,
                    correctAnswer: q.correctAnswer,
                    students: selectedAttempts.map((a) => {
                        const response = a.responses.find((r) => r.questionId === qid);
                        const selectedAnswer = response?.selectedAnswer ?? null;
                        const attempted = isAttemptedAnswer(selectedAnswer);
                        const marks = evaluateResponse({
                            userAnswer: selectedAnswer,
                            correctAnswer: q.correctAnswer,
                            schemeType: q.markingSchemeType,
                        });
                        return {
                            attemptId: a.id,
                            selectedAnswer,
                            attempted,
                            correct: attempted && marks > 0,
                            paletteStatus: response?.paletteStatus ?? "NOT_VISITED",
                            timeSpentSeconds: response?.timeSpentSeconds ?? 0,
                            marks,
                            reflection: reflectionByAttemptQuestion.get(`${a.id}::${qid}`) ?? null,
                        };
                    }),
                };
            }),
        };
    }

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

                            <div className="flex w-full min-w-0 items-center gap-2 overflow-x-auto whitespace-nowrap pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:w-auto sm:min-w-0 sm:overflow-visible">
                                <Link
                                    href="/"
                                    className="inline-flex w-auto shrink-0 items-center justify-center h-9 rounded-full border px-2 sm:px-3 text-[11px] sm:text-xs whitespace-nowrap ui-click"
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
                                    className="inline-flex w-auto shrink-0 items-center justify-center h-9 rounded-full border px-2 sm:px-3 text-[11px] sm:text-xs whitespace-nowrap ui-click"
                                    style={{ borderColor: "var(--border)", background: "transparent" }}
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
                                    className="inline-flex w-auto shrink-0 items-center justify-center h-9 rounded-full border px-2 sm:px-3 text-[11px] sm:text-xs whitespace-nowrap ui-click"
                                    style={{
                                        borderColor: "rgba(59, 130, 246, 0.5)",
                                        background: "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(14,165,233,0.9))",
                                        color: "#e0f2fe",
                                    }}
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
                                    href="/admin/papers"
                                    className="inline-flex w-auto shrink-0 items-center justify-center h-9 rounded-full border px-2 sm:px-3 text-[11px] sm:text-xs whitespace-nowrap ui-click"
                                    style={{ borderColor: "var(--border)", background: "transparent" }}
                                >
                                    <span className="mr-1 hidden sm:inline-flex" aria-hidden>
                                        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M6 3.8h5.8L15 7v9.2H6z" />
                                            <path d="M11.8 3.8V7H15" />
                                        </svg>
                                    </span>
                                    Papers
                                </Link>
                                <Link
                                    href="/admin/issues"
                                    className="inline-flex w-auto shrink-0 items-center justify-center h-9 rounded-full border px-2 sm:px-3 text-[11px] sm:text-xs whitespace-nowrap ui-click"
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
                <h1 className="text-2xl font-semibold">Consolidated Student Report</h1>
                <div className="mt-2 text-sm opacity-70">
                    Choose one paper and multiple student attempts to compare question-wise performance and reflections.
                </div>

                <ConsolidatedFilterForm
                    tests={tests.map((t) => ({
                        id: t.id,
                        title: t.title,
                        createdAt: t.createdAt.toISOString(),
                    }))}
                    selectedTestId={selectedTestId}
                    attemptChoices={attemptChoices.map((a) => ({
                        ...a,
                        startTimestamp: a.startTimestamp.toISOString(),
                        endTimestamp: a.endTimestamp ? a.endTimestamp.toISOString() : null,
                    }))}
                    selectedAttemptIds={selectedAttemptIds}
                />

                <div className="mt-6">
                    {consolidated ? (
                        <ConsolidatedReportView data={consolidated} />
                    ) : (
                        <div className="text-sm opacity-70">
                            Select a paper and at least one attempt to view consolidated report.
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
