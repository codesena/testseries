import Link from "next/link";
import { redirect } from "next/navigation";
import {
    getAssessmentFamily,
    getAssessmentHistoryPath,
    getAssessmentLabel,
    getAssessmentReportPath,
    getAssessmentShortLabel,
    getAssessmentStartPath,
    getTestSeriesVariant,
    type AssessmentVariant,
} from "@/lib/assessment";
import { TestsFilterForm } from "@/components/home/TestsFilterForm";
import { HomeHeader } from "@/components/home/HomeHeader";
import { getAuthUser } from "@/server/auth";
import { isAdminUsername } from "@/server/admin";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

type AssessmentCardItem = {
    key: string;
    id: string;
    variant: AssessmentVariant;
    title: string;
    createdAt: Date;
    durationMinutes: number;
    attemptCount: number;
    code?: string;
    questionCount?: number;
    subjectCount?: number;
};

type HistoryItem = {
    id: string;
    variant: AssessmentVariant;
    title: string;
    status: string;
    startTimestamp: Date;
    endTimestamp: Date | null;
    score: number | null;
    attempted: number;
    totalQuestions: number;
    totalTimeSeconds: number;
    attemptNo: number;
    attemptCount: number;
    reportPath: string;
};

function hasAnswer(value: unknown): boolean {
    if (value == null) return false;
    if (typeof value === "string") return value.trim() !== "";
    if (Array.isArray(value)) return value.length > 0;
    return true;
}

function isAttemptedV2(answerState: string, responseJson: unknown, numericValue: unknown): boolean {
    if (
        answerState === "ANSWERED_SAVED" ||
        answerState === "MARKED_FOR_REVIEW" ||
        answerState === "ANSWERED_MARKED_FOR_REVIEW"
    ) {
        return true;
    }

    if (numericValue != null) return true;
    if (Array.isArray(responseJson)) return responseJson.length > 0;
    if (typeof responseJson === "string") return responseJson.trim() !== "";
    return responseJson != null;
}

function fmtTime(seconds: number) {
    const clamped = Math.max(0, Math.floor(seconds));
    const hh = Math.floor(clamped / 3600);
    const mm = Math.floor((clamped % 3600) / 60);
    const ss = clamped % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

function fmtDate(d: Date) {
    return new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
    }).format(d);
}

export default async function Home(props: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const auth = await getAuthUser();
    if (!auth) {
        redirect("/login");
    }

    const userId = auth.userId;
    const isAdmin = isAdminUsername(auth.username);
    const searchParams = await props.searchParams;
    const rawQ = typeof searchParams.q === "string" ? searchParams.q : "";
    const rawStatus = typeof searchParams.status === "string" ? searchParams.status : "all";
    const rawFormat = typeof searchParams.format === "string" ? searchParams.format : "all";

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
    });
    const userInitial = (user?.name?.trim()?.[0] ?? "U").toUpperCase();

    const [
        tests,
        advancedExams,
        v2AttemptRows,
        legacyAttemptsAsc,
        v2AttemptsAsc,
        recentLegacyAttempts,
        recentV2Attempts,
    ] = await Promise.all([
        prisma.testSeries.findMany({
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                title: true,
                totalDurationMinutes: true,
                isAdvancedFormat: true,
                createdAt: true,
                _count: { select: { questions: true } },
            },
        }),
        prisma.examV2.findMany({
            where: { isActive: true },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                code: true,
                title: true,
                durationMinutes: true,
                createdAt: true,
                _count: { select: { subjects: true } },
                subjects: {
                    select: {
                        sections: {
                            select: {
                                blocks: {
                                    select: {
                                        questions: {
                                            select: { id: true },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        }),
        prisma.examV2Attempt.groupBy({
            by: ["examId"],
            where: { userId },
            _count: { _all: true },
        }),
        prisma.studentAttempt.findMany({
            where: { studentId: userId },
            orderBy: { startTimestamp: "asc" },
            select: { id: true, testId: true },
        }),
        prisma.examV2Attempt.findMany({
            where: { userId },
            orderBy: { startTimestamp: "asc" },
            select: { id: true, examId: true },
        }),
        prisma.studentAttempt.findMany({
            where: { studentId: userId },
            orderBy: { startTimestamp: "desc" },
            take: 30,
            select: {
                id: true,
                status: true,
                startTimestamp: true,
                endTimestamp: true,
                overallScore: true,
                questionOrder: true,
                responses: {
                    select: { selectedAnswer: true, timeSpentSeconds: true },
                },
                test: {
                    select: {
                        id: true,
                        title: true,
                        isAdvancedFormat: true,
                    },
                },
            },
        }),
        prisma.examV2Attempt.findMany({
            where: { userId },
            orderBy: { startTimestamp: "desc" },
            take: 30,
            select: {
                id: true,
                status: true,
                startTimestamp: true,
                submittedAt: true,
                scheduledEndAt: true,
                totalScore: true,
                responses: {
                    select: {
                        answerState: true,
                        responseJson: true,
                        numericValue: true,
                        timeSpentSeconds: true,
                    },
                },
                exam: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
            },
        }),
    ]);

    const attemptNumberByLegacyId = new Map<string, number>();
    const attemptCountByTestId = new Map<string, number>();
    for (const attempt of legacyAttemptsAsc) {
        const nextCount = (attemptCountByTestId.get(attempt.testId) ?? 0) + 1;
        attemptCountByTestId.set(attempt.testId, nextCount);
        attemptNumberByLegacyId.set(attempt.id, nextCount);
    }

    const attemptNumberByV2Id = new Map<string, number>();
    const v2AttemptCountByExamId = new Map(v2AttemptRows.map((row) => [row.examId, row._count._all] as const));
    const runningV2AttemptCountByExamId = new Map<string, number>();
    for (const attempt of v2AttemptsAsc) {
        const nextCount = (runningV2AttemptCountByExamId.get(attempt.examId) ?? 0) + 1;
        runningV2AttemptCountByExamId.set(attempt.examId, nextCount);
        attemptNumberByV2Id.set(attempt.id, nextCount);
    }

    const assessmentCards: AssessmentCardItem[] = [
        ...tests.map((test) => ({
            key: `legacy:${test.id}`,
            id: test.id,
            variant: getTestSeriesVariant(test.isAdvancedFormat),
            title: test.title,
            createdAt: test.createdAt,
            durationMinutes: test.totalDurationMinutes,
            attemptCount: attemptCountByTestId.get(test.id) ?? 0,
            questionCount: test._count.questions,
        })),
        ...advancedExams.map((exam) => ({
            key: `v2:${exam.id}`,
            id: exam.id,
            variant: "advancedV2" as const,
            title: exam.title,
            createdAt: exam.createdAt,
            durationMinutes: exam.durationMinutes,
            attemptCount: v2AttemptCountByExamId.get(exam.id) ?? 0,
            code: exam.code,
            subjectCount: exam._count.subjects,
            questionCount: exam.subjects.reduce(
                (subjectCount, subject) =>
                    subjectCount +
                    subject.sections.reduce(
                        (sectionCount, section) =>
                            sectionCount +
                            section.blocks.reduce(
                                (blockCount, block) => blockCount + block.questions.length,
                                0,
                            ),
                        0,
                    ),
                0,
            ),
        })),
    ].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

    const v2QuestionCountByExamId = new Map(
        assessmentCards
            .filter((assessment) => assessment.variant === "advancedV2")
            .map((assessment) => [assessment.id, assessment.questionCount ?? 0] as const),
    );

    const searchQuery = rawQ.trim().toLowerCase();
    const filteredAssessments = assessmentCards.filter((assessment) => {
        const matchesQuery =
            searchQuery.length === 0 ||
            assessment.title.toLowerCase().includes(searchQuery) ||
            assessment.code?.toLowerCase().includes(searchQuery);

        const matchesStatus =
            rawStatus === "all" ||
            (rawStatus === "attempted" && assessment.attemptCount > 0) ||
            (rawStatus === "unattempted" && assessment.attemptCount === 0);

        const family = getAssessmentFamily(assessment.variant);
        const matchesFormat =
            rawFormat === "all" ||
            (rawFormat === "advanced" && family === "advanced") ||
            (rawFormat === "main" && family === "main");

        return matchesQuery && matchesStatus && matchesFormat;
    });

    const historyItems: HistoryItem[] = [
        ...recentLegacyAttempts.map((attempt) => {
            const variant = getTestSeriesVariant(attempt.test.isAdvancedFormat);
            const totalQuestions = Array.isArray(attempt.questionOrder)
                ? attempt.questionOrder.length
                : attempt.responses.length;
            const attempted = attempt.responses.reduce(
                (count, response) => count + (hasAnswer(response.selectedAnswer) ? 1 : 0),
                0,
            );
            const totalTimeSeconds = attempt.responses.reduce(
                (count, response) => count + (response.timeSpentSeconds ?? 0),
                0,
            );

            return {
                id: attempt.id,
                variant,
                title: attempt.test.title,
                status: attempt.status,
                startTimestamp: attempt.startTimestamp,
                endTimestamp: attempt.endTimestamp,
                score: attempt.overallScore,
                attempted,
                totalQuestions,
                totalTimeSeconds,
                attemptNo: attemptNumberByLegacyId.get(attempt.id) ?? 0,
                attemptCount: attemptCountByTestId.get(attempt.test.id) ?? 0,
                reportPath: getAssessmentReportPath(variant, attempt.id),
            };
        }),
        ...recentV2Attempts.map((attempt) => {
            const attempted = attempt.responses.reduce(
                (count, response) =>
                    count +
                    (isAttemptedV2(
                        response.answerState,
                        response.responseJson,
                        response.numericValue != null ? Number(response.numericValue) : null,
                    )
                        ? 1
                        : 0),
                0,
            );
            const totalTimeSeconds = attempt.responses.reduce(
                (count, response) => count + (response.timeSpentSeconds ?? 0),
                0,
            );

            return {
                id: attempt.id,
                variant: "advancedV2" as const,
                title: attempt.exam.title,
                status: attempt.status,
                startTimestamp: attempt.startTimestamp,
                endTimestamp: attempt.submittedAt ?? attempt.scheduledEndAt,
                score: attempt.totalScore,
                attempted,
                totalQuestions: v2QuestionCountByExamId.get(attempt.exam.id) ?? 0,
                totalTimeSeconds,
                attemptNo: attemptNumberByV2Id.get(attempt.id) ?? 0,
                attemptCount: v2AttemptCountByExamId.get(attempt.exam.id) ?? 0,
                reportPath: getAssessmentReportPath("advancedV2", attempt.id),
            };
        }),
    ]
        .sort((left, right) => right.startTimestamp.getTime() - left.startTimestamp.getTime())
        .slice(0, 30);

    const totalAttemptCount = legacyAttemptsAsc.length + v2AttemptsAsc.length;
    const attemptedPapersCount = attemptCountByTestId.size + v2AttemptCountByExamId.size;
    const availableTotal = assessmentCards.length;
    const availableFiltered = filteredAssessments.length;
    const advancedPaperCount = assessmentCards.filter(
        (assessment) => getAssessmentFamily(assessment.variant) === "advanced",
    ).length;

    return (
        <div className="min-h-screen flex flex-col">
            <HomeHeader isAdmin={isAdmin} userInitial={userInitial} userName={user?.name ?? "User"} />

            <main className="max-w-5xl mx-auto w-full px-4 pt-7 pb-24 md:pb-8">
                <section id="dashboard" className="scroll-mt-24">
                    <h1 className="text-2xl font-semibold">Dashboard</h1>
                    <div className="mt-2 text-sm opacity-70">
                        {totalAttemptCount > 0
                            ? `You have ${totalAttemptCount} attempt${totalAttemptCount === 1 ? "" : "s"} across Main and Advanced papers.`
                            : "Kick off your preparation with the first paper."}
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                            <div className="text-xs opacity-60">Available papers</div>
                            <div className="mt-1 text-xl font-semibold">{availableTotal}</div>
                        </div>
                        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                            <div className="text-xs opacity-60">Attempted papers</div>
                            <div className="mt-1 text-xl font-semibold">{attemptedPapersCount}</div>
                        </div>
                        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                            <div className="text-xs opacity-60">Main papers</div>
                            <div className="mt-1 text-xl font-semibold">{availableTotal - advancedPaperCount}</div>
                        </div>
                        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                            <div className="text-xs opacity-60">Advanced papers</div>
                            <div className="mt-1 text-xl font-semibold">{advancedPaperCount}</div>
                        </div>
                    </div>
                </section>

                <section id="tests" className="mt-10 scroll-mt-24">
                    <h2 className="text-2xl font-semibold">Available Papers</h2>
                    <TestsFilterForm rawQ={rawQ} rawStatus={rawStatus} rawFormat={rawFormat} />
                    <div className="mt-2 text-xs opacity-60">
                        Showing {availableFiltered} of {availableTotal} papers
                    </div>

                    <div className="mt-6 grid gap-3">
                        {filteredAssessments.map((assessment) => {
                            const hasAttempts = assessment.attemptCount > 0;

                            return (
                                <div
                                    key={assessment.key}
                                    className="rounded-2xl border p-4 shadow-sm"
                                    style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                >
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0">
                                            <div className="text-lg font-semibold leading-snug">{assessment.title}</div>
                                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                                                <span
                                                    className="inline-flex items-center justify-center h-7 rounded-full border px-2.5 whitespace-nowrap"
                                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                                >
                                                    {getAssessmentLabel(assessment.variant)}
                                                </span>
                                                {assessment.code ? <span className="opacity-60">{assessment.code}</span> : null}
                                                {typeof assessment.questionCount === "number" ? (
                                                    <span className="opacity-60">{assessment.questionCount} questions</span>
                                                ) : null}
                                                {typeof assessment.subjectCount === "number" ? (
                                                    <span className="opacity-60">{assessment.subjectCount} subjects</span>
                                                ) : null}
                                                <span className="opacity-60">⏱ {assessment.durationMinutes} mins</span>
                                                <span className="opacity-60">Created {fmtDate(assessment.createdAt)}</span>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                            <span
                                                className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap"
                                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                            >
                                                {hasAttempts ? `Attempted ${assessment.attemptCount}x` : "Unattempted"}
                                            </span>

                                            <Link
                                                href={getAssessmentHistoryPath(assessment.variant, assessment.id)}
                                                className={`inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click ${hasAttempts ? "font-semibold" : ""}`}
                                                style={
                                                    hasAttempts
                                                        ? {
                                                            borderColor: "rgba(59, 130, 246, 0.5)",
                                                            background: "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(14,165,233,0.9))",
                                                            color: "#e0f2fe",
                                                        }
                                                        : { borderColor: "var(--border)", background: "transparent" }
                                                }
                                            >
                                                View history
                                            </Link>

                                            <Link
                                                href={getAssessmentStartPath(assessment.variant, assessment.id)}
                                                className={`inline-flex items-center justify-center h-9 rounded-full border px-4 text-xs whitespace-nowrap ui-click ${hasAttempts ? "font-medium" : "font-semibold"}`}
                                                style={
                                                    hasAttempts
                                                        ? { borderColor: "var(--border)", background: "transparent" }
                                                        : {
                                                            borderColor: "rgba(59, 130, 246, 0.5)",
                                                            background: "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(14,165,233,0.9))",
                                                            color: "#e0f2fe",
                                                        }
                                                }
                                            >
                                                {hasAttempts ? "Retake Paper" : "Start Paper"}
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {availableTotal === 0 ? (
                            <div
                                className="rounded-xl border p-6 text-center"
                                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                            >
                                <div className="text-2xl">🧪</div>
                                <div className="mt-2 text-base font-medium">No papers available yet</div>
                                <div className="mt-1 text-sm opacity-70">
                                    New papers will appear here after sync or seed.
                                </div>
                            </div>
                        ) : availableFiltered === 0 ? (
                            <div
                                className="rounded-xl border p-6 text-center"
                                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                            >
                                <div className="text-2xl">🔎</div>
                                <div className="mt-2 text-base font-medium">No papers match your filter</div>
                                <div className="mt-1 text-sm opacity-70">Try a different search keyword or reset filters.</div>
                            </div>
                        ) : null}
                    </div>
                </section>

                <section id="history" className="mt-10 scroll-mt-24">
                    <h2 className="text-xl font-semibold">Attempt History</h2>
                    <div className="mt-2 text-sm opacity-70">
                        Total attempts: {totalAttemptCount}
                    </div>

                    <div className="mt-4 grid gap-3">
                        {historyItems.map((attempt) => (
                            <Link
                                key={`${attempt.variant}:${attempt.id}`}
                                href={attempt.reportPath}
                                className="rounded-lg border p-3 sm:p-4 ui-click"
                                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                            >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <div className="font-medium leading-snug break-words">{attempt.title}</div>
                                            <span
                                                className="inline-flex items-center justify-center h-7 rounded-full border px-2.5 text-[11px] whitespace-nowrap"
                                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                            >
                                                {getAssessmentShortLabel(attempt.variant)}
                                            </span>
                                        </div>
                                        <div className="mt-1 text-sm opacity-70 leading-snug">
                                            Attempt {attempt.attemptNo}/{attempt.attemptCount} · Status {attempt.status}
                                        </div>
                                        <div className="text-xs opacity-60 leading-snug">
                                            Started {fmtDate(attempt.startTimestamp)}
                                            {attempt.endTimestamp ? <span className="hidden sm:inline">{` · Ended ${fmtDate(attempt.endTimestamp)}`}</span> : null}
                                        </div>
                                        <div className="mt-2 text-sm opacity-80 leading-snug">
                                            Score: {attempt.score ?? "—"} · Attempted: {attempt.attempted}/{attempt.totalQuestions || "—"} · Time: {fmtTime(attempt.totalTimeSeconds)}
                                        </div>
                                    </div>
                                    <span
                                        className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs font-medium whitespace-nowrap self-start sm:self-auto ui-click"
                                        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                    >
                                        View report
                                    </span>
                                </div>
                            </Link>
                        ))}

                        {historyItems.length === 0 ? (
                            <div
                                className="rounded-xl border p-6 text-center"
                                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                            >
                                <div className="text-2xl">🚀</div>
                                <div className="mt-2 text-base font-medium">No attempts yet</div>
                                <div className="mt-1 text-sm opacity-70">
                                    Start your first paper to unlock progress insights.
                                </div>
                            </div>
                        ) : null}
                    </div>

                    {totalAttemptCount > historyItems.length ? (
                        <div className="mt-2 text-xs opacity-60">
                            Showing latest {historyItems.length} attempts.
                        </div>
                    ) : null}
                </section>
            </main>

            <nav
                className="fixed bottom-3 left-1/2 z-40 -translate-x-1/2 md:hidden"
                aria-label="Mobile quick navigation"
            >
                <div className="flex items-center gap-1 rounded-full border px-1.5 py-1 shadow-lg" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--card) 92%, transparent)" }}>
                    <Link href="#dashboard" className="inline-flex h-8 items-center justify-center rounded-full px-2.5 text-[11px] ui-click" style={{ background: "transparent" }}>
                        Home
                    </Link>
                    <Link href="#tests" className="inline-flex h-8 items-center justify-center rounded-full px-2.5 text-[11px] ui-click" style={{ background: "transparent" }}>
                        Papers
                    </Link>
                    <Link href="#history" className="inline-flex h-8 items-center justify-center rounded-full px-2.5 text-[11px] ui-click" style={{ background: "transparent" }}>
                        History
                    </Link>
                    <Link href="/reset-password" className="inline-flex h-8 items-center justify-center rounded-full px-2.5 text-[11px] ui-click" style={{ background: "transparent" }}>
                        Profile
                    </Link>
                </div>
            </nav>
        </div>
    );
}
