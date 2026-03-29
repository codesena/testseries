import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getAuthUser } from "@/server/auth";
import { isAdminUsername } from "@/server/admin";
import { CandidateAttemptsClient } from "@/components/admin/CandidateAttemptsClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasAnswer(value: unknown): boolean {
    if (value == null) return false;
    if (typeof value === "string") return value.trim() !== "";
    if (Array.isArray(value)) return value.length > 0;
    return true;
}

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

export default async function AdminCandidateTestPage(
    props: { params: Promise<{ userId: string; testId: string }> },
) {
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
                        <div className="mt-1 text-sm opacity-70">Your account is not allowed to view admin reports.</div>
                    </div>
                </main>
            </div>
        );
    }

    const { userId, testId } = await props.params;

    const candidate = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, username: true },
    });

    const test = await prisma.testSeries.findUnique({
        where: { id: testId },
        select: { id: true, title: true },
    });

    const attempts = await prisma.studentAttempt.findMany({
        where: { studentId: userId, testId },
        orderBy: { startTimestamp: "desc" },
        select: {
            id: true,
            status: true,
            overallScore: true,
            startTimestamp: true,
            endTimestamp: true,
            responses: { select: { selectedAnswer: true, timeSpentSeconds: true } },
            _count: { select: { activities: true, issueReports: true } },
        },
    });

    const attemptRows = attempts.map((a) => {
        const responseCount = a.responses.length;
        const answeredCount = a.responses.reduce(
            (acc, r) => acc + (hasAnswer(r.selectedAnswer) ? 1 : 0),
            0,
        );
        const totalTimeSeconds = a.responses.reduce(
            (acc, r) => acc + (r.timeSpentSeconds ?? 0),
            0,
        );

        return {
            id: a.id,
            status: a.status,
            overallScore: a.overallScore,
            startTimestamp: a.startTimestamp.toISOString(),
            endTimestamp: a.endTimestamp ? a.endTimestamp.toISOString() : null,
            responseCount,
            answeredCount,
            totalTimeSeconds,
            activityCount: a._count.activities,
            issueCount: a._count.issueReports,
        };
    });

    const candidateLabel = candidate ? `${candidate.name} (${candidate.username})` : userId;
    const testTitle = test?.title ?? testId;

    return (
        <div className="min-h-screen flex flex-col">
            <header
                className="sticky top-0 z-50 border-b"
                style={{ borderColor: "var(--border)", background: "var(--background)" }}
            >
                <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Link
                            href={`/admin/candidate/${userId}`}
                            className="text-xs rounded-full border px-3 py-1 ui-click"
                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        >
                            ← Papers
                        </Link>
                        <Link
                            href="/admin"
                            className="text-xs rounded-full border px-3 py-1 ui-click"
                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        >
                            Admin
                        </Link>
                    </div>
                    <div className="text-sm opacity-70 truncate">Attempts</div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto w-full px-4 py-8">
                <h1 className="text-2xl font-semibold">Attempts</h1>
                <div className="mt-2 text-sm opacity-70">{candidateLabel}</div>
                <div className="mt-1 text-sm opacity-70">{testTitle}</div>

                <CandidateAttemptsClient
                    initialAttempts={attemptRows}
                    candidateLabel={candidateLabel}
                    testTitle={testTitle}
                />
            </main>
        </div>
    );
}
