import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getAuthUser } from "@/server/auth";
import { isAdminUsername } from "@/server/admin";
import { TestsFilterForm } from "@/components/home/TestsFilterForm";
import { HomeHeader } from "@/components/home/HomeHeader";

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
    const [weeklyAttemptCount] = await Promise.all([
        prisma.studentAttempt.count({
            where: { studentId: userId, startTimestamp: { gte: oneWeekAgo } },
        }),
    ]);

    const attemptedTestsCount = attemptCountByTestId.size;

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
            <HomeHeader isAdmin={isAdmin} userInitial={userInitial} userName={user?.name ?? "User"} />

            <main className="max-w-5xl mx-auto w-full px-4 pt-8 pb-24 md:pb-8">
                <section id="dashboard" className="scroll-mt-24">
                    <h1 className="text-2xl font-semibold">Dashboard</h1>
                    <div className="mt-2 text-sm opacity-70">
                        {weeklyAttemptCount > 0
                            ? `You attempted ${weeklyAttemptCount} test${weeklyAttemptCount === 1 ? "" : "s"} this week.`
                            : "Kick off this week with your first attempt."}
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                            <div className="text-xs opacity-60">Total tests</div>
                            <div className="mt-1 text-xl font-semibold">{tests.length}</div>
                        </div>
                        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                            <div className="text-xs opacity-60">Attempted papers</div>
                            <div className="mt-1 text-xl font-semibold">{attemptedTestsCount}</div>
                        </div>
                    </div>
                </section>

                <section id="tests" className="mt-10 scroll-mt-24">
                    <h1 className="text-2xl font-semibold">Available Tests</h1>
                    <TestsFilterForm rawQ={rawQ} rawStatus={rawStatus} rawFormat={rawFormat} />
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
                                {(() => {
                                    const attemptCount = attemptCountByTestId.get(t.id) ?? 0;
                                    const hasAttempts = attemptCount > 0;

                                    return (
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
                                                {!hasAttempts ? (
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
                                                        Attempted {attemptCount}x
                                                    </span>
                                                )}

                                                <Link
                                                    href={`/test/${t.id}/history`}
                                                    className={`inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click ${hasAttempts ? "font-semibold" : ""
                                                        }`}
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
                                                    href={`/test/${t.id}`}
                                                    className={`inline-flex items-center justify-center h-9 rounded-full border px-4 text-xs whitespace-nowrap ui-click ${hasAttempts ? "font-medium" : "font-semibold"
                                                        }`}
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
                                                    {hasAttempts ? "Retake Test" : "Start Test"}
                                                </Link>
                                            </div>
                                        </div>
                                    );
                                })()}
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

            <nav
                className="fixed bottom-3 left-1/2 z-40 -translate-x-1/2 md:hidden"
                aria-label="Mobile quick navigation"
            >
                <div className="flex items-center gap-1 rounded-full border p-1 shadow-lg" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--card) 90%, transparent)" }}>
                    <Link href="#dashboard" className="inline-flex h-9 items-center justify-center rounded-full px-3 text-xs ui-click" style={{ background: "transparent" }}>
                        Home
                    </Link>
                    <Link href="#tests" className="inline-flex h-9 items-center justify-center rounded-full px-3 text-xs ui-click" style={{ background: "transparent" }}>
                        Tests
                    </Link>
                    <Link href="#history" className="inline-flex h-9 items-center justify-center rounded-full px-3 text-xs ui-click" style={{ background: "transparent" }}>
                        History
                    </Link>
                    <Link href="/reset-password" className="inline-flex h-9 items-center justify-center rounded-full px-3 text-xs ui-click" style={{ background: "transparent" }}>
                        Profile
                    </Link>
                </div>
            </nav>
        </div>
    );
}
