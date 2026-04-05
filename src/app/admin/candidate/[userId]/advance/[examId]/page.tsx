import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getAuthUser } from "@/server/auth";
import { isAdminUsername } from "@/server/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasAnswer(value: unknown): boolean {
    if (value == null) return false;
    if (typeof value === "string") return value.trim() !== "";
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return true;
    return true;
}

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

function fmtTime(seconds: number): string {
    const clamped = Math.max(0, Math.floor(seconds));
    const hh = Math.floor(clamped / 3600);
    const mm = Math.floor((clamped % 3600) / 60);
    const ss = clamped % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

export default async function AdminCandidateAdvancedPage(
    props: { params: Promise<{ userId: string; examId: string }> },
) {
    const auth = await getAuthUser();
    if (!auth) redirect("/login");
    if (!isAdminUsername(auth.username)) redirect("/admin");

    const { userId, examId } = await props.params;

    const [candidate, exam, attempts] = await Promise.all([
        prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, username: true },
        }),
        prisma.examV2.findUnique({
            where: { id: examId },
            select: { id: true, title: true, code: true },
        }),
        prisma.examV2Attempt.findMany({
            where: { userId, examId },
            orderBy: { startTimestamp: "desc" },
            select: {
                id: true,
                status: true,
                totalScore: true,
                startTimestamp: true,
                scheduledEndAt: true,
                submittedAt: true,
                responses: {
                    select: {
                        responseJson: true,
                        timeSpentSeconds: true,
                    },
                },
                _count: {
                    select: {
                        events: true,
                    },
                },
            },
        }),
    ]);

    const candidateLabel = candidate ? `${candidate.name} (${candidate.username})` : userId;
    const examTitle = exam?.title ?? exam?.code ?? examId;

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
                        <div className="flex flex-nowrap items-center gap-3 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                            <div className="flex min-w-0 items-center gap-2 shrink-0">
                                <Link
                                    href={`/admin/candidate/${userId}`}
                                    className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                >
                                    Papers
                                </Link>
                                <Link
                                    href="/admin"
                                    className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                >
                                    Admin
                                </Link>
                            </div>
                            <div className="text-sm opacity-70 truncate shrink-0 ml-auto">Advanced attempts</div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto w-full px-4 py-8">
                <section className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                    <h1 className="text-2xl font-semibold">Attempts</h1>
                    <div className="mt-2 text-sm opacity-70">{candidateLabel}</div>
                    <div className="mt-1 text-sm opacity-70">{examTitle}</div>

                    <div className="mt-6 grid gap-3">
                        {attempts.map((a) => {
                            const responseCount = a.responses.length;
                            const answeredCount = a.responses.reduce((acc, r) => acc + (hasAnswer(r.responseJson) ? 1 : 0), 0);
                            const totalTimeSeconds = a.responses.reduce((acc, r) => acc + (r.timeSpentSeconds ?? 0), 0);

                            return (
                                <div
                                    key={a.id}
                                    className="rounded-2xl border p-4"
                                    style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                >
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0">
                                            <div className="font-medium truncate">Attempt {a.id.slice(0, 8)}</div>
                                            <div className="mt-1 text-xs opacity-60">
                                                <span className="inline-flex items-center rounded-full border px-2 py-0.5 mr-2" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                                                    {a.status}
                                                </span>
                                                Score {a.totalScore ?? "—"}
                                            </div>
                                            <div className="mt-1 text-xs opacity-60">
                                                Start {fmtDate(a.startTimestamp)} · End {fmtDate(a.submittedAt ?? a.scheduledEndAt)}
                                            </div>
                                            <div className="mt-1 text-xs opacity-60">
                                                Answered {answeredCount}/{responseCount} · Time {fmtTime(totalTimeSeconds)} · Events {a._count.events}
                                            </div>
                                        </div>

                                        <div className="shrink-0">
                                            <Link
                                                href={`/admin/candidate/${userId}/advance/${examId}/attempt/${a.id}/report`}
                                                className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                            >
                                                View report
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {attempts.length === 0 ? (
                            <div className="text-sm opacity-70">No advanced attempts found for this paper.</div>
                        ) : null}
                    </div>
                </section>
            </main>
        </div>
    );
}
