import Link from "next/link";
import { redirect } from "next/navigation";
import {
    SlimPageHeader,
    getSlimHeaderPillStyle,
    slimHeaderPillClassName,
} from "@/components/common/SlimPageHeader";
import { getAssessmentAdminDeleteAttemptPath, getAssessmentLabel } from "@/lib/assessment";
import { prisma } from "@/server/db";
import { getAuthUser } from "@/server/auth";
import { isAdminUsername } from "@/server/admin";
import { CandidateAttemptsClient } from "@/components/admin/CandidateAttemptsClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAttemptedV2(answerState: string, responseJson: unknown, numericValue: unknown): boolean {
    if (
        answerState === "ANSWERED_SAVED" ||
        answerState === "MARKED_FOR_REVIEW" ||
        answerState === "ANSWERED_MARKED_FOR_REVIEW"
    ) {
        return true;
    }

    if (numericValue != null) return true;
    if (typeof responseJson === "string") return responseJson.trim() !== "";
    if (Array.isArray(responseJson)) return responseJson.length > 0;
    return responseJson != null;
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
                        answerState: true,
                        responseJson: true,
                        numericValue: true,
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
    const attemptRows = attempts.map((a) => {
        const responseCount = a.responses.length;
        const answeredCount = a.responses.reduce(
            (acc, response) =>
                acc +
                (isAttemptedV2(
                    response.answerState,
                    response.responseJson,
                    response.numericValue != null ? Number(response.numericValue) : null,
                )
                    ? 1
                    : 0),
            0,
        );
        const totalTimeSeconds = a.responses.reduce((acc, r) => acc + (r.timeSpentSeconds ?? 0), 0);

        return {
            id: a.id,
            status: a.status,
            overallScore: a.totalScore,
            startTimestamp: a.startTimestamp.toISOString(),
            endTimestamp: (a.submittedAt ?? a.scheduledEndAt)?.toISOString() ?? null,
            responseCount,
            answeredCount,
            totalTimeSeconds,
            activityCount: a._count.events,
            issueCount: 0,
        };
    });

    return (
        <div className="min-h-screen flex flex-col">
            <SlimPageHeader
                badgeLabel="A"
                title={`${getAssessmentLabel("advancedV2")} Attempts`}
                subtitle="Inspect candidate attempts, reports, and events for this paper."
                actions={
                    <>
                        <Link
                            href={`/admin/candidate/${userId}`}
                            className={slimHeaderPillClassName}
                            style={getSlimHeaderPillStyle()}
                        >
                            Papers
                        </Link>
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
                            Attempts
                        </span>
                    </>
                }
            />

            <main className="max-w-5xl mx-auto w-full px-4 py-8">
                <section className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                    <h1 className="text-2xl font-semibold">Attempts</h1>
                    <div className="mt-2 text-sm opacity-70">{candidateLabel}</div>
                    <div className="mt-1 text-sm opacity-70">{examTitle}</div>

                    <CandidateAttemptsClient
                        initialAttempts={attemptRows}
                        candidateLabel={candidateLabel}
                        testTitle={examTitle}
                        reportHrefTemplate={`/admin/candidate/${userId}/advance/${examId}/attempt/{attemptId}/report`}
                        deleteEndpointTemplate={`${getAssessmentAdminDeleteAttemptPath("{attemptId}")}`}
                        activityLabel="Events"
                    />
                </section>
            </main>
        </div>
    );
}
