import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getAuthUserId } from "@/server/auth";

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

export default async function TestAttemptHistoryPage({
    params,
}: {
    params: Promise<{ testId: string }>;
}) {
    const userId = await getAuthUserId();
    if (!userId) {
        redirect("/login");
    }

    const { testId } = await params;

    const test = await prisma.testSeries.findUnique({
        where: { id: testId },
        select: {
            id: true,
            title: true,
            totalDurationMinutes: true,
            _count: { select: { questions: true } },
        },
    });

    if (!test) return notFound();

    const attemptsAsc = await prisma.studentAttempt.findMany({
        where: { studentId: userId, testId },
        orderBy: { startTimestamp: "asc" },
        select: { id: true },
    });

    const attemptNumberById = new Map<string, number>();
    for (let i = 0; i < attemptsAsc.length; i++) {
        attemptNumberById.set(attemptsAsc[i].id, i + 1);
    }

    const attempts = await prisma.studentAttempt.findMany({
        where: { studentId: userId, testId },
        orderBy: { startTimestamp: "desc" },
        select: {
            id: true,
            status: true,
            startTimestamp: true,
            endTimestamp: true,
            overallScore: true,
            questionOrder: true,
            responses: { select: { selectedAnswer: true, timeSpentSeconds: true } },
        },
    });

    return (
        <div className="min-h-screen flex flex-col">
            <header
                className="sticky top-0 z-50 border-b"
                style={{ borderColor: "var(--border)", background: "var(--background)" }}
            >
                <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                    <Link
                        href="/"
                        className="inline-flex items-center justify-center h-10 rounded-full border px-4 text-xs ui-click"
                        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                    >
                        Back
                    </Link>
                    <div className="text-sm opacity-70">Attempt History</div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto w-full px-4 py-8">
                <h1 className="text-2xl font-semibold">{test.title}</h1>
                <div className="mt-2 text-sm opacity-70">
                    {test._count.questions} questions · {test.totalDurationMinutes} min
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
                    <span
                        className="inline-flex items-center justify-center h-10 rounded-full border px-4 text-xs whitespace-nowrap"
                        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                    >
                        {attemptsAsc.length === 0
                            ? "Unattempted"
                            : `Attempted ${attemptsAsc.length} time${attemptsAsc.length === 1 ? "" : "s"}`}
                    </span>
                    <Link
                        href={`/test/${test.id}`}
                        className="inline-flex items-center justify-center h-10 rounded-full border px-4 text-xs whitespace-nowrap ui-click"
                        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                    >
                        Start test
                    </Link>
                </div>

                <div className="mt-6 grid gap-3">
                    {attempts.map((a) => {
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
                        const attemptCount = attemptsAsc.length;

                        return (
                            <Link
                                key={a.id}
                                href={`/attempt/${a.id}/report`}
                                className="rounded-lg border p-3 sm:p-4 ui-click"
                                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                            >
                                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="font-medium">
                                            Attempt {attemptNo}/{attemptCount}
                                        </div>
                                        <div className="mt-1 text-sm opacity-70">
                                            Status {a.status}
                                        </div>
                                        <div className="text-xs opacity-60">
                                            Started {fmtDate(a.startTimestamp)}
                                            {a.endTimestamp
                                                ? ` · Ended ${fmtDate(a.endTimestamp)}`
                                                : ""}
                                        </div>
                                        <div className="mt-2 text-sm opacity-80">
                                            Score: {a.overallScore ?? "—"} · Attempted: {attempted}/
                                            {totalQuestions || "—"} · Time: {fmtTime(totalTimeSeconds)}
                                        </div>
                                    </div>
                                    <span
                                        className="inline-flex items-center justify-center h-10 text-xs font-medium rounded-full border px-4 whitespace-nowrap self-start sm:self-auto"
                                        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                    >
                                        View report
                                    </span>
                                </div>
                            </Link>
                        );
                    })}

                    {attempts.length === 0 ? (
                        <div className="text-sm opacity-70">No attempts yet.</div>
                    ) : null}
                </div>
            </main>
        </div>
    );
}
