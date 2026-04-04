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
        timeZone: "Asia/Kolkata",
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
                className="sticky top-0 z-50 border-b backdrop-blur-md"
                style={{
                    borderColor: "var(--border)",
                    background: "color-mix(in srgb, var(--background) 88%, transparent)",
                }}
            >
                <div className="max-w-5xl mx-auto px-4 py-2">
                    <div className="rounded-2xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                            <div className="flex items-center gap-2 min-w-0 shrink-0">
                                <div
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold shrink-0"
                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                >
                                    J
                                </div>
                                <div className="text-sm font-medium">JEE Test Series</div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-auto">
                                <Link
                                    href="/"
                                    className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                >
                                    Home
                                </Link>
                                <Link
                                    href="/#tests"
                                    className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                >
                                    Available tests
                                </Link>
                                <span
                                    className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap"
                                    style={{
                                        borderColor: "rgba(59, 130, 246, 0.5)",
                                        background: "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(14,165,233,0.9))",
                                        color: "#e0f2fe",
                                    }}
                                >
                                    History
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto w-full px-4 pt-7 pb-14">
                <section className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                    <h1 className="text-2xl font-semibold">{test.title}</h1>
                    <div className="mt-2 text-sm opacity-70">
                        {test._count.questions} questions · {test.totalDurationMinutes} min
                    </div>

                    <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
                        <span
                            className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap"
                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        >
                            {attemptsAsc.length === 0
                                ? "Unattempted"
                                : `Attempted ${attemptsAsc.length} time${attemptsAsc.length === 1 ? "" : "s"}`}
                        </span>
                        <Link
                            href={`/test/${test.id}`}
                            className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        >
                            Start test
                        </Link>
                    </div>
                </section>

                <div className="mt-5 grid gap-3">
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
                                className="rounded-2xl border p-3 sm:p-4 ui-click"
                                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                            >
                                <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <div className="font-semibold text-base">
                                                Attempt {attemptNo}/{attemptCount}
                                            </div>
                                            <span
                                                className="inline-flex items-center justify-center h-7 rounded-full border px-2.5 text-[11px] whitespace-nowrap"
                                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                            >
                                                {a.status}
                                            </span>
                                        </div>
                                        <div className="text-xs opacity-60">
                                            Started {fmtDate(a.startTimestamp)}
                                            {a.endTimestamp
                                                ? ` · Ended ${fmtDate(a.endTimestamp)}`
                                                : ""}
                                        </div>

                                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                                            <span
                                                className="inline-flex items-center justify-center h-7 rounded-full border px-2.5 whitespace-nowrap"
                                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                            >
                                                Score {a.overallScore ?? "—"}
                                            </span>
                                            <span
                                                className="inline-flex items-center justify-center h-7 rounded-full border px-2.5 whitespace-nowrap"
                                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                            >
                                                Attempted {attempted}/{totalQuestions || "—"}
                                            </span>
                                            <span
                                                className="inline-flex items-center justify-center h-7 rounded-full border px-2.5 whitespace-nowrap"
                                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                            >
                                                Time {fmtTime(totalTimeSeconds)}
                                            </span>
                                        </div>
                                    </div>
                                    <span
                                        className="inline-flex items-center justify-center h-9 text-xs font-medium rounded-full border px-3 whitespace-nowrap self-start lg:self-center"
                                        style={{
                                            borderColor: "rgba(59, 130, 246, 0.5)",
                                            background: "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(14,165,233,0.9))",
                                            color: "#e0f2fe",
                                        }}
                                    >
                                        View report
                                    </span>
                                </div>
                            </Link>
                        );
                    })}

                    {attempts.length === 0 ? (
                        <div
                            className="rounded-xl border p-6 text-center"
                            style={{ borderColor: "var(--border)", background: "var(--card)" }}
                        >
                            <div className="text-2xl">📘</div>
                            <div className="mt-2 text-base font-medium">No attempts for this paper yet</div>
                            <div className="mt-1 text-sm opacity-70">Start the test to generate your first report entry.</div>
                        </div>
                    ) : null}
                </div>
            </main>
        </div>
    );
}
