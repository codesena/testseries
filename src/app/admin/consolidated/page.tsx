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
        return new Intl.DateTimeFormat(undefined, {
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
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
                    className="sticky top-0 z-50 border-b"
                    style={{ borderColor: "var(--border)", background: "var(--background)" }}
                >
                    <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
                        <Link
                            href="/"
                            className="text-xs rounded-full border px-3 py-1 ui-click"
                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        >
                            Home
                        </Link>
                        <div className="text-sm opacity-70">Admin</div>
                    </div>
                </header>

                <main className="max-w-6xl mx-auto w-full px-4 py-8">
                    <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
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

        const reflectionRows = await prisma.attemptQuestionReflection.findMany({
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
                className="sticky top-0 z-50 border-b"
                style={{ borderColor: "var(--border)", background: "var(--background)" }}
            >
                <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link
                            href="/admin"
                            className="text-xs rounded-full border px-3 py-1 ui-click"
                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        >
                            ← Admin
                        </Link>
                        <Link
                            href="/"
                            className="text-xs rounded-full border px-3 py-1 ui-click"
                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        >
                            Home
                        </Link>
                    </div>
                    <div className="text-sm opacity-70">Consolidated report</div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto w-full px-4 py-8">
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
