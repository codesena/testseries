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

export default async function AdminCandidatePage(
    props: { params: Promise<{ userId: string }> },
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
                            <div className="flex items-center justify-between gap-2">
                                <Link
                                    href="/"
                                    className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                >
                                    Home
                                </Link>
                                <div className="text-sm opacity-70">Admin</div>
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

    const { userId } = await props.params;

    const candidate = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, username: true },
    });

    if (!candidate) {
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
                            <div className="flex items-center justify-between gap-2">
                                <Link
                                    href="/admin"
                                    className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                >
                                    Admin
                                </Link>
                                <div className="text-sm opacity-70">Candidate</div>
                            </div>
                        </div>
                    </div>
                </header>

                <main className="max-w-5xl mx-auto w-full px-4 py-8">
                    <div className="text-sm opacity-70">Candidate not found.</div>
                </main>
            </div>
        );
    }

    const testAgg = await prisma.studentAttempt.groupBy({
        by: ["testId"],
        where: { studentId: userId },
        _count: { _all: true },
        _max: { startTimestamp: true },
        orderBy: { _max: { startTimestamp: "desc" } },
    });

    const testIds = testAgg.map((t) => t.testId);
    const tests = await prisma.testSeries.findMany({
        where: { id: { in: testIds } },
        select: { id: true, title: true },
    });
    const testById = new Map(tests.map((t) => [t.id, t] as const));

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
                        <div className="flex items-center justify-between gap-2">
                            <Link
                                href="/admin"
                                className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                            >
                                Admin
                            </Link>
                            <div className="text-sm opacity-70">Admin</div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto w-full px-4 py-8">
                <section className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                    <h1 className="text-2xl font-semibold">Papers accessed</h1>
                    <div className="mt-2 text-sm opacity-70">
                        {candidate.name} ({candidate.username})
                    </div>

                    <div className="mt-6 grid gap-3">
                        {testAgg.map((t) => {
                            const test = testById.get(t.testId);
                            const title = test?.title ?? t.testId;
                            return (
                                <div
                                    key={t.testId}
                                    className="rounded-2xl border p-4"
                                    style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                >
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0">
                                            <div className="font-medium truncate">{title}</div>
                                            <div className="mt-1 text-xs opacity-60">
                                                {t._count._all} attempt{t._count._all === 1 ? "" : "s"}
                                                {t._max.startTimestamp ? ` · Last ${fmtDate(t._max.startTimestamp)}` : ""}
                                            </div>
                                        </div>

                                        <div className="shrink-0">
                                            <Link
                                                href={`/admin/candidate/${candidate.id}/test/${t.testId}`}
                                                className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                            >
                                                View attempts
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {testAgg.length === 0 ? (
                            <div className="text-sm opacity-70">No papers found for this candidate.</div>
                        ) : null}
                    </div>
                </section>
            </main>
        </div>
    );
}
