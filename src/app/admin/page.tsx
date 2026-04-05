import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getAuthUser } from "@/server/auth";
import { isAdminUsername } from "@/server/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmtDate(d: Date | null) {
    if (!d) return "—";
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

export default async function AdminPage() {
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
                                        <div className="hidden sm:block text-[11px] leading-tight" style={{ color: "var(--foreground)", opacity: 0.8 }}>
                                            Access-restricted dashboard
                                        </div>
                                    </div>
                                </div>

                                <div className="flex w-full items-center gap-2 sm:w-auto sm:justify-end">
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
                    </div>
                </header>

                <main className="max-w-5xl mx-auto w-full px-4 py-8">
                    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                        <div className="text-sm font-medium">Access denied</div>
                        <div className="mt-1 text-sm opacity-70">
                            Your account is not allowed to view admin reports.
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    const [mainAttemptAgg, advancedAttemptAgg, mainPaperPairs, advancedPaperPairs] = await Promise.all([
        prisma.studentAttempt.groupBy({
            by: ["studentId"],
            _count: { _all: true },
            _max: { startTimestamp: true },
        }),
        prisma.examV2Attempt.groupBy({
            by: ["userId"],
            _count: { _all: true },
            _max: { startTimestamp: true },
        }),
        prisma.studentAttempt.groupBy({
            by: ["studentId", "testId"],
            _count: { _all: true },
        }),
        prisma.examV2Attempt.groupBy({
            by: ["userId", "examId"],
            _count: { _all: true },
        }),
    ]);

    const statsByStudentId = new Map<string, { attemptCount: number; paperCount: number; lastAttemptAt: Date | null }>();

    for (const row of mainAttemptAgg) {
        statsByStudentId.set(row.studentId, {
            attemptCount: row._count._all,
            paperCount: 0,
            lastAttemptAt: row._max.startTimestamp,
        });
    }

    for (const row of advancedAttemptAgg) {
        const current = statsByStudentId.get(row.userId);
        if (!current) {
            statsByStudentId.set(row.userId, {
                attemptCount: row._count._all,
                paperCount: 0,
                lastAttemptAt: row._max.startTimestamp,
            });
            continue;
        }

        const currentTs = current.lastAttemptAt ? current.lastAttemptAt.getTime() : 0;
        const rowTs = row._max.startTimestamp ? row._max.startTimestamp.getTime() : 0;
        current.attemptCount += row._count._all;
        current.lastAttemptAt = rowTs > currentTs ? row._max.startTimestamp : current.lastAttemptAt;
    }

    for (const row of mainPaperPairs) {
        const current = statsByStudentId.get(row.studentId);
        if (!current) continue;
        current.paperCount += 1;
    }

    for (const row of advancedPaperPairs) {
        const current = statsByStudentId.get(row.userId);
        if (!current) continue;
        current.paperCount += 1;
    }

    const candidateRows = Array.from(statsByStudentId.entries())
        .map(([studentId, stats]) => ({ studentId, ...stats }))
        .sort((a, b) => {
            const aTs = a.lastAttemptAt ? a.lastAttemptAt.getTime() : 0;
            const bTs = b.lastAttemptAt ? b.lastAttemptAt.getTime() : 0;
            return bTs - aTs;
        });

    const studentIds = candidateRows.map((a) => a.studentId);
    const students = await prisma.user.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, name: true, username: true },
    });
    const studentById = new Map(students.map((s) => [s.id, s] as const));

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
                                    className="inline-flex w-auto shrink-0 items-center justify-center h-9 rounded-full border px-2 sm:px-3 text-[11px] sm:text-xs whitespace-nowrap ui-click"
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
                <h1 className="text-2xl font-semibold">Candidates</h1>
                <div className="mt-2 text-sm opacity-70">Select a candidate to view papers and reports.</div>

                <div className="mt-6 grid gap-3">
                    {candidateRows.map((a) => {
                        const student = studentById.get(a.studentId);
                        const studentLabel = student
                            ? `${student.name} (${student.username})`
                            : a.studentId;
                        const paperCount = a.paperCount;
                        const lastAttemptAt = a.lastAttemptAt;

                        return (
                            <div
                                key={a.studentId}
                                className="rounded-2xl border p-4 shadow-sm"
                                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                            >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                        <div className="font-medium leading-snug break-words">{studentLabel}</div>
                                        <div className="mt-1 text-xs opacity-60">
                                            {paperCount} paper{paperCount === 1 ? "" : "s"} · {a.attemptCount} attempt{a.attemptCount === 1 ? "" : "s"}
                                            {lastAttemptAt ? ` · Last ${fmtDate(lastAttemptAt)}` : ""}
                                        </div>
                                    </div>

                                    <div className="flex w-full sm:w-auto items-center gap-2 shrink-0">
                                        <Link
                                            href={`/admin/candidate/${a.studentId}`}
                                            className="inline-flex w-full sm:w-auto items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                        >
                                            View papers
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {candidateRows.length === 0 ? (
                        <div className="text-sm opacity-70">No candidates found.</div>
                    ) : null}
                </div>
            </main>
        </div>
    );
}
