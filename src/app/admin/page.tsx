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
                <header className="border-b" style={{ borderColor: "var(--border)" }}>
                    <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
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

    const attempts = await prisma.studentAttempt.findMany({
        orderBy: { startTimestamp: "desc" },
        take: 200,
        select: {
            id: true,
            studentId: true,
            status: true,
            overallScore: true,
            startTimestamp: true,
            endTimestamp: true,
            test: { select: { title: true } },
        },
    });

    const studentIds = Array.from(new Set(attempts.map((a) => a.studentId)));
    const students = await prisma.user.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, name: true, username: true },
    });
    const studentById = new Map(students.map((s) => [s.id, s] as const));

    return (
        <div className="min-h-screen flex flex-col">
            <header className="border-b" style={{ borderColor: "var(--border)" }}>
                <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
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
                <h1 className="text-2xl font-semibold">Candidate Reports</h1>
                <div className="mt-2 text-sm opacity-70">
                    Showing latest {attempts.length} attempts.
                </div>

                <div className="mt-6 grid gap-3">
                    {attempts.map((a) => {
                        const student = studentById.get(a.studentId);
                        const studentLabel = student
                            ? `${student.name} (${student.username})`
                            : a.studentId;

                        return (
                            <div
                                key={a.id}
                                className="rounded-lg border p-4"
                                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                            >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                        <div className="font-medium truncate">{a.test.title}</div>
                                        <div className="mt-1 text-sm opacity-80 truncate">{studentLabel}</div>
                                        <div className="mt-1 text-xs opacity-60">
                                            {a.status} · Score {a.overallScore ?? "—"} · Start {fmtDate(a.startTimestamp)} · End {fmtDate(a.endTimestamp)}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <Link
                                            href={`/attempt/${a.id}/report`}
                                            className="text-xs rounded-full border px-3 py-1 ui-click"
                                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                        >
                                            View report →
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {attempts.length === 0 ? (
                        <div className="text-sm opacity-70">No attempts found.</div>
                    ) : null}
                </div>
            </main>
        </div>
    );
}
