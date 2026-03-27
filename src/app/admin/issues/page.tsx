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

function snippet(s: string | null | undefined, max = 220) {
    const v = (s ?? "").trim();
    if (!v) return "—";
    if (v.length <= max) return v;
    return v.slice(0, max - 1) + "…";
}

export default async function AdminIssueReportsPage() {
    const auth = await getAuthUser();
    if (!auth) redirect("/login");

    if (!isAdminUsername(auth.username)) {
        return (
            <div className="min-h-screen flex flex-col">
                <header
                    className="sticky top-0 z-50 border-b"
                    style={{ borderColor: "var(--border)", background: "var(--background)" }}
                >
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
                    <div
                        className="rounded-lg border p-4"
                        style={{ borderColor: "var(--border)", background: "var(--card)" }}
                    >
                        <div className="text-sm font-medium">Access denied</div>
                        <div className="mt-1 text-sm opacity-70">
                            Your account is not allowed to view admin reports.
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    const reports = await prisma.questionIssueReport.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
            id: true,
            createdAt: true,
            issue: true,
            details: true,
            attemptId: true,
            questionId: true,
            user: { select: { id: true, name: true, username: true } },
            attempt: { select: { test: { select: { id: true, title: true } } } },
            question: {
                select: {
                    id: true,
                    topicName: true,
                    questionText: true,
                    subject: { select: { name: true } },
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
                <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
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
                    <div className="text-sm opacity-70">Issue reports</div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto w-full px-4 py-8">
                <h1 className="text-2xl font-semibold">Reported questions</h1>
                <div className="mt-2 text-sm opacity-70">
                    Shows the latest question issue reports submitted by students.
                </div>

                <div className="mt-6 grid gap-3">
                    {reports.map((r) => {
                        const studentLabel = r.user
                            ? `${r.user.name} (${r.user.username})`
                            : "—";
                        const title = r.attempt?.test?.title ?? "—";
                        const meta = [
                            fmtDate(r.createdAt),
                            title,
                            r.question?.subject?.name ?? "—",
                            r.question?.topicName ?? "—",
                        ]
                            .filter(Boolean)
                            .join(" · ");

                        return (
                            <div
                                key={String(r.id)}
                                className="rounded-lg border p-4"
                                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                            >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                        <div className="font-medium truncate">{r.issue}</div>
                                        <div className="mt-1 text-xs opacity-60 truncate">{meta}</div>
                                        <div className="mt-2 text-sm opacity-80 truncate">
                                            By: {studentLabel}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <Link
                                            href={`/attempt/${r.attemptId}/report`}
                                            className="text-xs rounded-full border px-3 py-1 ui-click"
                                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                        >
                                            Attempt report →
                                        </Link>
                                    </div>
                                </div>

                                <div className="mt-3 text-xs opacity-70">Question</div>
                                <div className="mt-1 text-sm whitespace-pre-wrap">
                                    {snippet(r.question?.questionText ?? null)}
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2 text-xs opacity-70">
                                    <span>QuestionId: {r.questionId}</span>
                                    <span>AttemptId: {r.attemptId}</span>
                                </div>

                                {r.details ? (
                                    <>
                                        <div className="mt-3 text-xs opacity-70">Comment</div>
                                        <div className="mt-1 text-sm whitespace-pre-wrap">{r.details}</div>
                                    </>
                                ) : (
                                    <div className="mt-3 text-sm opacity-60">No comment provided.</div>
                                )}
                            </div>
                        );
                    })}

                    {reports.length === 0 ? (
                        <div className="text-sm opacity-70">No issue reports yet.</div>
                    ) : null}
                </div>
            </main>
        </div>
    );
}
