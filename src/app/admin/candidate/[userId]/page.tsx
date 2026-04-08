import Link from "next/link";
import { redirect } from "next/navigation";
import {
    getAssessmentAdminCandidatePaperPath,
    getAssessmentShortLabel,
    getTestSeriesVariant,
} from "@/lib/assessment";
import {
    SlimPageHeader,
    getSlimHeaderPillStyle,
    slimHeaderPillClassName,
} from "@/components/common/SlimPageHeader";
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
                <SlimPageHeader
                    badgeLabel="A"
                    title="Admin"
                    actions={
                        <Link
                            href="/"
                            className={slimHeaderPillClassName}
                            style={getSlimHeaderPillStyle()}
                        >
                            Home
                        </Link>
                    }
                />

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
                <SlimPageHeader
                    badgeLabel="A"
                    title="Candidate"
                    actions={
                        <Link
                            href="/admin"
                            className={slimHeaderPillClassName}
                            style={getSlimHeaderPillStyle()}
                        >
                            Admin
                        </Link>
                    }
                />

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

    const advancedAgg = await prisma.examV2Attempt.groupBy({
        by: ["examId"],
        where: { userId },
        _count: { _all: true },
        _max: { startTimestamp: true },
        orderBy: { _max: { startTimestamp: "desc" } },
    });

    const testIds = testAgg.map((t) => t.testId);
    const examIds = advancedAgg.map((a) => a.examId);

    const tests = await prisma.testSeries.findMany({
        where: { id: { in: testIds } },
        select: { id: true, title: true, isAdvancedFormat: true },
    });
    const advancedExams = await prisma.examV2.findMany({
        where: { id: { in: examIds } },
        select: { id: true, title: true, code: true },
    });

    const testById = new Map(tests.map((t) => [t.id, t] as const));
    const examById = new Map(advancedExams.map((e) => [e.id, e] as const));

    const papers = [
        ...testAgg.map((t) => {
            const test = testById.get(t.testId);
            const variant = getTestSeriesVariant(test?.isAdvancedFormat ?? false);
            return {
                kind: variant,
                paperId: t.testId,
                title: test?.title ?? t.testId,
                attemptCount: t._count._all,
                lastAttemptAt: t._max.startTimestamp,
                href: getAssessmentAdminCandidatePaperPath(variant, candidate.id, t.testId),
            };
        }),
        ...advancedAgg.map((a) => {
            const exam = examById.get(a.examId);
            return {
                kind: "advancedV2" as const,
                paperId: a.examId,
                title: exam?.title ?? exam?.code ?? a.examId,
                attemptCount: a._count._all,
                lastAttemptAt: a._max.startTimestamp,
                href: getAssessmentAdminCandidatePaperPath("advancedV2", candidate.id, a.examId),
            };
        }),
    ].sort((x, y) => {
        const aTs = x.lastAttemptAt ? new Date(x.lastAttemptAt).getTime() : 0;
        const bTs = y.lastAttemptAt ? new Date(y.lastAttemptAt).getTime() : 0;
        return bTs - aTs;
    });

    return (
        <div className="min-h-screen flex flex-col">
            <SlimPageHeader
                badgeLabel="A"
                title="Candidate Papers"
                subtitle="Open any Main or Advanced paper the candidate has attempted."
                actions={
                    <>
                        <Link
                            href="/admin"
                            className={slimHeaderPillClassName}
                            style={getSlimHeaderPillStyle()}
                        >
                            Admin
                        </Link>
                        <span
                            className={slimHeaderPillClassName}
                            style={getSlimHeaderPillStyle("accent")}
                        >
                            Papers
                        </span>
                    </>
                }
            />

            <main className="max-w-5xl mx-auto w-full px-4 py-8">
                <section className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                    <h1 className="text-2xl font-semibold">Papers accessed</h1>
                    <div className="mt-2 text-sm opacity-70">
                        {candidate.name} ({candidate.username})
                    </div>

                    <div className="mt-6 grid gap-3">
                        {papers.map((paper) => {
                            return (
                                <div
                                    key={`${paper.kind}:${paper.paperId}`}
                                    className="rounded-2xl border p-4"
                                    style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                >
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0">
                                            <div className="font-medium truncate">{paper.title}</div>
                                            <div className="mt-1 text-xs opacity-60">
                                                <span className="inline-flex items-center rounded-full border px-2 py-0.5 mr-2" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                                                    {getAssessmentShortLabel(paper.kind)}
                                                </span>
                                                {paper.attemptCount} attempt{paper.attemptCount === 1 ? "" : "s"}
                                                {paper.lastAttemptAt ? ` · Last ${fmtDate(paper.lastAttemptAt)}` : ""}
                                            </div>
                                        </div>

                                        <div className="shrink-0">
                                            <Link
                                                href={paper.href}
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

                        {papers.length === 0 ? (
                            <div className="text-sm opacity-70">No papers found for this candidate.</div>
                        ) : null}
                    </div>
                </section>
            </main>
        </div>
    );
}
