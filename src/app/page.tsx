import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getAuthUser } from "@/server/auth";
import { LogoutButton } from "@/components/LogoutButton";
import { isAdminUsername } from "@/server/admin";

export const dynamic = "force-dynamic";

function hasAnswer(value: unknown): boolean {
    if (value == null) return false;
    if (typeof value === "string") return value.trim() !== "";
    if (Array.isArray(value)) return value.length > 0;
    return true;
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

    const tests = await prisma.testSeries.findMany({
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            title: true,
            totalDurationMinutes: true,
            isAdvancedFormat: true,
            createdAt: true,
            _count: { select: { questions: true } },
        },
    });

    // Attempt history (per candidate)
    const allAttemptIds = await prisma.studentAttempt.findMany({
        where: { studentId: userId },
        orderBy: { startTimestamp: "asc" },
        select: { id: true, testId: true },
    });

    const attemptNumberById = new Map<string, number>();
    const attemptCountByTestId = new Map<string, number>();
    for (const a of allAttemptIds) {
        const next = (attemptCountByTestId.get(a.testId) ?? 0) + 1;
        attemptCountByTestId.set(a.testId, next);
        attemptNumberById.set(a.id, next);
    }

    const recentAttempts = await prisma.studentAttempt.findMany({
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
                    totalDurationMinutes: true,
                },
            },
        },
    });

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [weeklyAttemptCount, scoreAvg] = await Promise.all([
        prisma.studentAttempt.count({
            where: { studentId: userId, startTimestamp: { gte: oneWeekAgo } },
        }),
        prisma.studentAttempt.aggregate({
            where: { studentId: userId, overallScore: { not: null } },
            _avg: { overallScore: true },
        }),
    ]);

    const attemptedTestsCount = attemptCountByTestId.size;
    const averageScoreText =
        scoreAvg._avg.overallScore == null
            ? "—"
            : `${Math.round(Number(scoreAvg._avg.overallScore))}%`;

    const searchQuery = rawQ.trim().toLowerCase();
    const filteredTests = tests.filter((t) => {
        const matchesQuery =
            searchQuery.length === 0 || t.title.toLowerCase().includes(searchQuery);

        const count = attemptCountByTestId.get(t.id) ?? 0;
        const matchesStatus =
            rawStatus === "all" ||
            (rawStatus === "attempted" && count > 0) ||
            (rawStatus === "unattempted" && count === 0);

        const matchesFormat =
            rawFormat === "all" ||
            (rawFormat === "advanced" && t.isAdvancedFormat) ||
            (rawFormat === "main" && !t.isAdvancedFormat);

        return matchesQuery && matchesStatus && matchesFormat;
    });

    return (
        <div className="min-h-screen flex flex-col">
            <header
                className="sticky top-0 z-50 border-b"
                style={{ borderColor: "var(--border)", background: "var(--background)" }}
            >
                <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-2">
                        <div
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold"
                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        >
                            J
                        </div>
                        <div>
                            <div className="text-base font-semibold">JEE Test Series</div>
                            <div className="text-[11px] opacity-60">Practice. Analyze. Improve.</div>
                        </div>
                    </div>
                    <div className="flex min-w-0 items-center gap-2 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                        <a
                            href="#dashboard"
                            className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        >
                            Dashboard
                        </a>
                        <a
                            href="#tests"
                            className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        >
                            Tests
                        </a>
                        <a
                            href="#history"
                            className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        >
                            History
                        </a>
                    </div>
                    <div className="flex items-center flex-wrap justify-end gap-2">
                        <span className="text-xs opacity-60">Student: {user?.name ?? "—"}</span>
                        {isAdmin ? (
                            <Link
                                href="/admin"
                                className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                            >
                                Admin
                            </Link>
                        ) : null}
                        <ThemeToggle />
                        <LogoutButton />
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto w-full px-4 py-8">
                <section id="dashboard" className="scroll-mt-24">
                    <h1 className="text-2xl font-semibold">Dashboard</h1>
                    <div className="mt-2 text-sm opacity-70">
                        {weeklyAttemptCount > 0
                            ? `You attempted ${weeklyAttemptCount} test${weeklyAttemptCount === 1 ? "" : "s"} this week.`
                            : "Kick off this week with your first attempt."}
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                            <div className="text-xs opacity-60">Total tests</div>
                            <div className="mt-1 text-xl font-semibold">{tests.length}</div>
                        </div>
                        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                            <div className="text-xs opacity-60">Attempted papers</div>
                            <div className="mt-1 text-xl font-semibold">{attemptedTestsCount}</div>
                        </div>
                        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                            <div className="text-xs opacity-60">Average score</div>
                            <div className="mt-1 text-xl font-semibold">{averageScoreText}</div>
                        </div>
                    </div>
                </section>

                <section id="tests" className="mt-10 scroll-mt-24">
                    <h1 className="text-2xl font-semibold">Available Tests</h1>
                    <form className="mt-4 grid gap-2 sm:grid-cols-[1fr_170px_170px_auto]" method="GET">
                        <input
                            name="q"
                            defaultValue={rawQ}
                            placeholder="Search tests"
                            className="h-10 rounded-full border px-4 bg-transparent ui-field text-sm"
                            style={{ borderColor: "var(--border)" }}
                        />
                        <select
                            name="status"
                            defaultValue={rawStatus}
                            className="h-10 rounded-full border px-4 bg-transparent ui-field text-sm"
                            style={{ borderColor: "var(--border)" }}
                        >
                            <option value="all">All status</option>
                            <option value="attempted">Attempted</option>
                            <option value="unattempted">Unattempted</option>
                        </select>
                        <select
                            name="format"
                            defaultValue={rawFormat}
                            className="h-10 rounded-full border px-4 bg-transparent ui-field text-sm"
                            style={{ borderColor: "var(--border)" }}
                        >
                            <option value="all">All formats</option>
                            <option value="main">JEE Main</option>
                            <option value="advanced">JEE Advanced</option>
                        </select>
                        <button
                            type="submit"
                            className="inline-flex items-center justify-center h-10 rounded-full border px-4 text-sm font-medium ui-click"
                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        >
                            Apply
                        </button>
                    </form>
                    <div className="mt-2 text-xs opacity-60">
                        Showing {filteredTests.length} of {tests.length} tests
                    </div>
                    <div className="mt-6 grid gap-3">
                        {filteredTests.map((t) => (
                            <div
                                key={t.id}
                                className="rounded-2xl border p-4 shadow-sm"
                                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                            >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                        <div className="text-lg font-semibold leading-snug">{t.title}</div>
                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                                            <span
                                                className="inline-flex items-center justify-center h-7 rounded-full border px-2.5 whitespace-nowrap"
                                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                            >
                                                {t.isAdvancedFormat ? "JEE Advanced" : "JEE Main"}
                                            </span>
                                            <span className="opacity-60">{t._count.questions} questions</span>
                                            <span className="opacity-60">⏱ {t.totalDurationMinutes} mins</span>
                                            <span className="opacity-60">Created {fmtDate(t.createdAt)}</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                        {(attemptCountByTestId.get(t.id) ?? 0) === 0 ? (
                                            <span
                                                className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap"
                                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                            >
                                                Unattempted
                                            </span>
                                        ) : (
                                            <span
                                                className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap"
                                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                            >
                                                Attempted {attemptCountByTestId.get(t.id) ?? 0}x
                                            </span>
                                        )}

                                        <Link
                                            href={`/test/${t.id}/history`}
                                            className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                            style={{ borderColor: "var(--border)", background: "transparent" }}
                                        >
                                            View history
                                        </Link>

                                        {isAdmin ? (
                                            <Link
                                                href={`/admin/paper/${t.id}`}
                                                className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                                style={{ borderColor: "var(--border)", background: "transparent" }}
                                            >
                                                View paper
                                            </Link>
                                        ) : null}

                                        <Link
                                            href={`/test/${t.id}`}
                                            className="inline-flex items-center justify-center h-9 rounded-full border px-4 text-xs font-semibold whitespace-nowrap ui-click"
                                            style={{
                                                borderColor: "rgba(59, 130, 246, 0.5)",
                                                background: "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(14,165,233,0.9))",
                                                color: "#e0f2fe",
                                            }}
                                        >
                                            Start Test
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {tests.length === 0 ? (
                            <div
                                className="rounded-xl border p-6 text-center"
                                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                            >
                                <div className="text-2xl">🧪</div>
                                <div className="mt-2 text-base font-medium">No tests available yet</div>
                                <div className="mt-1 text-sm opacity-70">
                                    New papers will appear here after sync/seed.
                                </div>
                            </div>
                        ) : filteredTests.length === 0 ? (
                            <div
                                className="rounded-xl border p-6 text-center"
                                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                            >
                                <div className="text-2xl">🔎</div>
                                <div className="mt-2 text-base font-medium">No tests match your filter</div>
                                <div className="mt-1 text-sm opacity-70">Try a different search keyword or reset filters.</div>
                            </div>
                        ) : null}
                    </div>
                </section>

                <div id="history" className="mt-10 scroll-mt-24">
                    <h2 className="text-xl font-semibold">Attempt History</h2>
                    <div className="mt-2 text-sm opacity-70">
                        Total attempts: {allAttemptIds.length}
                    </div>

                    <div className="mt-4 grid gap-3">
                        {recentAttempts.map((a) => {
                            const totalQuestions = Array.isArray(a.questionOrder)
                                ? a.questionOrder.length
                                : 0;
                            const attempted = a.responses.reduce(
                                (acc, r) => acc + (hasAnswer(r.selectedAnswer) ? 1 : 0),
                                0,
                            );
                            const totalTimeSeconds = a.responses.reduce(
                                (acc, r) => acc + (r.timeSpentSeconds ?? 0),
                                0,
                            );

                            const attemptNo = attemptNumberById.get(a.id) ?? 0;
                            const attemptCountForTest = attemptCountByTestId.get(a.test.id) ?? 0;

                            return (
                                <Link
                                    key={a.id}
                                    href={`/attempt/${a.id}/report`}
                                    className="rounded-lg border p-3 sm:p-4 ui-click"
                                    style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                >
                                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="font-medium leading-snug break-words">{a.test.title}</div>
                                            <div className="mt-1 text-sm opacity-70 leading-snug">
                                                Attempt {attemptNo}/{attemptCountForTest} · Status {a.status}
                                            </div>
                                            <div className="text-xs opacity-60 leading-snug">
                                                Started {fmtDate(a.startTimestamp)}
                                                {a.endTimestamp ? <span className="hidden sm:inline">{` · Ended ${fmtDate(a.endTimestamp)}`}</span> : null}
                                            </div>
                                            <div className="mt-2 text-sm opacity-80 leading-snug">
                                                Score: {a.overallScore ?? "—"} · Attempted: {attempted}/{totalQuestions || "—"} · Time: {fmtTime(totalTimeSeconds)}
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
                            );
                        })}

                        {recentAttempts.length === 0 ? (
                            <div
                                className="rounded-xl border p-6 text-center"
                                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                            >
                                <div className="text-2xl">🚀</div>
                                <div className="mt-2 text-base font-medium">No attempts yet</div>
                                <div className="mt-1 text-sm opacity-70">
                                    Start your first test to unlock progress insights.
                                </div>
                            </div>
                        ) : null}
                    </div>

                    {allAttemptIds.length > recentAttempts.length ? (
                        <div className="mt-2 text-xs opacity-60">
                            Showing latest {recentAttempts.length} attempts.
                        </div>
                    ) : null}
                </div>
            </main>
        </div>
    );
}
