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

export default async function Home() {
    const auth = await getAuthUser();
    if (!auth) {
        redirect("/login");
    }

    const userId = auth.userId;
    const isAdmin = isAdminUsername(auth.username);

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

    return (
        <div className="min-h-screen flex flex-col">
            <header
                className="sticky top-0 z-50 border-b"
                style={{ borderColor: "var(--border)", background: "var(--background)" }}
            >
                <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                        <div className="text-base font-semibold">JEE Test Series</div>
                        <div className="text-xs opacity-60">Student: {user?.name ?? "—"}</div>
                    </div>
                    <div className="flex items-center flex-wrap justify-end gap-2">
                        {isAdmin ? (
                            <Link
                                href="/admin"
                                className="text-xs rounded-full border px-3 py-1 ui-click"
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
                <h1 className="text-2xl font-semibold">Available Tests</h1>
                <div className="mt-6 grid gap-3">
                    {tests.map((t) => (
                        <div
                            key={t.id}
                            className="rounded-lg border p-4"
                            style={{ borderColor: "var(--border)", background: "var(--card)" }}
                        >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                    <div className="font-medium">{t.title}</div>
                                    <div className="text-sm opacity-70">
                                        {t._count.questions} questions · {t.totalDurationMinutes} min
                                        {t.isAdvancedFormat ? " · Advanced" : ""}
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                    {(attemptCountByTestId.get(t.id) ?? 0) === 0 ? (
                                        <span
                                            className="text-xs rounded-full border px-3 py-1"
                                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                        >
                                            Unattempted
                                        </span>
                                    ) : (
                                        <Link
                                            href={`/test/${t.id}/history`}
                                            className="text-xs rounded-full border px-3 py-1 ui-click"
                                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                        >
                                            Attempted {attemptCountByTestId.get(t.id) ?? 0} time
                                            {(attemptCountByTestId.get(t.id) ?? 0) === 1 ? "" : "s"}
                                        </Link>
                                    )}

                                    {isAdmin ? (
                                        <Link
                                            href={`/admin/paper/${t.id}`}
                                            className="text-xs rounded-full border px-3 py-1 ui-click"
                                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                        >
                                            View paper
                                        </Link>
                                    ) : null}

                                    <Link
                                        href={`/test/${t.id}`}
                                        className="text-xs rounded-full border px-3 py-1 ui-click"
                                        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                    >
                                        Start
                                    </Link>
                                </div>
                            </div>
                        </div>
                    ))}
                    {tests.length === 0 ? (
                        <div className="text-sm opacity-70">
                            No tests found. Run DB migration + seed.
                        </div>
                    ) : null}
                </div>

                <div className="mt-10">
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
                                            className="text-xs font-medium rounded-full border px-3 py-1 whitespace-nowrap self-start sm:self-auto ui-click"
                                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                        >
                                            View report
                                        </span>
                                    </div>
                                </Link>
                            );
                        })}

                        {recentAttempts.length === 0 ? (
                            <div className="text-sm opacity-70">
                                No attempts yet.
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
