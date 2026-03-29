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

export default async function AdminPage() {
    const auth = await getAuthUser();
    if (!auth) redirect("/login");

    if (!isAdminUsername(auth.username)) {
        return (
            <div className="min-h-screen flex flex-col">
                <header
                    className="sticky top-0 z-50 border-b"
                    style={{ borderColor: "var(--border)", background: "var(--background)" }}
                >
                    <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
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

                <main className="max-w-5xl mx-auto w-full px-4 py-8">
                    <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                        <div className="text-sm font-medium">Access denied</div>
                        <div className="mt-1 text-sm opacity-70">
                            Your account is not allowed to view admin reports.
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    const attemptAgg = await prisma.studentAttempt.groupBy({
        by: ["studentId"],
        _count: { _all: true },
        _max: { startTimestamp: true },
        orderBy: { _max: { startTimestamp: "desc" } },
    });

    const testPairs = await prisma.studentAttempt.groupBy({
        by: ["studentId", "testId"],
        _count: { _all: true },
    });

    const testCountByStudentId = new Map<string, number>();
    for (const row of testPairs) {
        testCountByStudentId.set(row.studentId, (testCountByStudentId.get(row.studentId) ?? 0) + 1);
    }

    const studentIds = attemptAgg.map((a) => a.studentId);
    const students = await prisma.user.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, name: true, username: true },
    });
    const studentById = new Map(students.map((s) => [s.id, s] as const));

    return (
        <div className="min-h-screen flex flex-col">
            <header
                className="sticky top-0 z-50 border-b"
                style={{ borderColor: "var(--border)", background: "var(--background)" }}
            >
                <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
                    <Link
                        href="/"
                        className="text-xs rounded-full border px-3 py-1 ui-click"
                        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                    >
                        Home
                    </Link>
                    <div className="flex items-center gap-2">
                        <Link
                            href="/admin/consolidated"
                            className="text-xs rounded-full border px-3 py-1 ui-click"
                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        >
                            Consolidated report
                        </Link>
                        <Link
                            href="/admin/issues"
                            className="text-xs rounded-full border px-3 py-1 ui-click"
                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        >
                            Issue reports
                        </Link>
                        <div className="text-sm opacity-70">Admin</div>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto w-full px-4 py-8">
                <h1 className="text-2xl font-semibold">Candidates</h1>
                <div className="mt-2 text-sm opacity-70">Select a candidate to view papers and reports.</div>

                <div className="mt-6 grid gap-3">
                    {attemptAgg.map((a) => {
                        const student = studentById.get(a.studentId);
                        const studentLabel = student
                            ? `${student.name} (${student.username})`
                            : a.studentId;
                        const paperCount = testCountByStudentId.get(a.studentId) ?? 0;
                        const lastAttemptAt = a._max.startTimestamp;

                        return (
                            <div
                                key={a.studentId}
                                className="rounded-lg border p-4"
                                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                            >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                        <div className="font-medium truncate">{studentLabel}</div>
                                        <div className="mt-1 text-xs opacity-60">
                                            {paperCount} paper{paperCount === 1 ? "" : "s"} · {a._count._all} attempt{a._count._all === 1 ? "" : "s"}
                                            {lastAttemptAt ? ` · Last ${fmtDate(lastAttemptAt)}` : ""}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <Link
                                            href={`/admin/candidate/${a.studentId}`}
                                            className="text-xs rounded-full border px-3 py-1 ui-click"
                                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                        >
                                            View papers →
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {attemptAgg.length === 0 ? (
                        <div className="text-sm opacity-70">No candidates found.</div>
                    ) : null}
                </div>
            </main>
        </div>
    );
}
