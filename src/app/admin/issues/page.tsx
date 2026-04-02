import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getAuthUser } from "@/server/auth";
import { isAdminUsername } from "@/server/admin";
import { IssueReportsClient } from "@/components/admin/IssueReportsClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
                    <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
                        <Link
                            href="/"
                            className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
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
            attempt: {
                select: {
                    studentId: true,
                    test: { select: { id: true, title: true } },
                },
            },
            question: {
                select: {
                    id: true,
                    topicName: true,
                    questionText: true,
                    imageUrls: true,
                    options: true,
                    subject: { select: { name: true } },
                },
            },
        },
    });

    const adminReports = await prisma.adminQuestionIssueReport.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
            id: true,
            createdAt: true,
            issue: true,
            details: true,
            questionId: true,
            user: { select: { id: true, name: true, username: true } },
            question: {
                select: {
                    id: true,
                    topicName: true,
                    questionText: true,
                    imageUrls: true,
                    options: true,
                    subject: { select: { name: true } },
                },
            },
        },
    });

    const attemptOwnerIds = Array.from(
        new Set(
            reports
                .map((r) => r.attempt?.studentId)
                .filter((id): id is string => Boolean(id)),
        ),
    );
    const attemptOwners = attemptOwnerIds.length
        ? await prisma.user.findMany({
            where: { id: { in: attemptOwnerIds } },
            select: { id: true, name: true, username: true },
        })
        : [];
    const attemptOwnerById = new Map(attemptOwners.map((u) => [u.id, u] as const));

    const groupByQuestionId = new Map<
        string,
        {
            questionId: string;
            subjectName: string | null;
            topicName: string | null;
            questionText: string | null;
            imageUrls: string[] | null;
            options: unknown;
            reports: Array<{
                id: string;
                createdAt: string;
                issue: string;
                details: string | null;
                attemptId: string | null;
                reporterName: string | null;
                reporterUsername: string | null;
                reporterId: string | null;
                attemptOwnerName: string | null;
                attemptOwnerUsername: string | null;
                attemptOwnerId: string | null;
                testTitle: string | null;
                source: "student" | "admin";
            }>;
            latestCreatedAt: string;
        }
    >();

    for (const r of reports) {
        const qid = String(r.questionId);
        const existing = groupByQuestionId.get(qid);
        const createdAtIso = r.createdAt.toISOString();

        const reportItem = {
            id: String(r.id),
            createdAt: createdAtIso,
            issue: r.issue,
            details: r.details,
            attemptId: r.attemptId,
            reporterName: r.user?.name ?? null,
            reporterUsername: r.user?.username ?? null,
            reporterId: r.user?.id ?? null,
            attemptOwnerName: r.attempt?.studentId
                ? (attemptOwnerById.get(r.attempt.studentId)?.name ?? null)
                : null,
            attemptOwnerUsername: r.attempt?.studentId
                ? (attemptOwnerById.get(r.attempt.studentId)?.username ?? null)
                : null,
            attemptOwnerId: r.attempt?.studentId ?? null,
            testTitle: r.attempt?.test?.title ?? null,
            source: "student" as const,
        };

        if (!existing) {
            groupByQuestionId.set(qid, {
                questionId: qid,
                subjectName: r.question?.subject?.name ?? null,
                topicName: r.question?.topicName ?? null,
                questionText: r.question?.questionText ?? null,
                imageUrls: (r.question as any)?.imageUrls ?? null,
                options: (r.question as any)?.options ?? null,
                reports: [reportItem],
                latestCreatedAt: createdAtIso,
            });
        } else {
            existing.reports.push(reportItem);
            if (createdAtIso > existing.latestCreatedAt) {
                existing.latestCreatedAt = createdAtIso;
            }
        }
    }

    for (const r of adminReports) {
        const qid = String(r.questionId);
        const existing = groupByQuestionId.get(qid);
        const createdAtIso = r.createdAt.toISOString();

        const reportItem = {
            id: `admin-${String(r.id)}`,
            createdAt: createdAtIso,
            issue: r.issue,
            details: r.details,
            attemptId: null,
            reporterName: r.user?.name ?? null,
            reporterUsername: r.user?.username ?? null,
            reporterId: r.user?.id ?? null,
            attemptOwnerName: null,
            attemptOwnerUsername: null,
            attemptOwnerId: null,
            testTitle: null,
            source: "admin" as const,
        };

        if (!existing) {
            groupByQuestionId.set(qid, {
                questionId: qid,
                subjectName: r.question?.subject?.name ?? null,
                topicName: r.question?.topicName ?? null,
                questionText: r.question?.questionText ?? null,
                imageUrls: (r.question as any)?.imageUrls ?? null,
                options: (r.question as any)?.options ?? null,
                reports: [reportItem],
                latestCreatedAt: createdAtIso,
            });
        } else {
            existing.reports.push(reportItem);
            if (createdAtIso > existing.latestCreatedAt) {
                existing.latestCreatedAt = createdAtIso;
            }
        }
    }

    const groups = Array.from(groupByQuestionId.values()).sort((a, b) =>
        b.latestCreatedAt.localeCompare(a.latestCreatedAt),
    );

    return (
        <div className="min-h-screen flex flex-col">
            <header
                className="sticky top-0 z-50 border-b"
                style={{ borderColor: "var(--border)", background: "var(--background)" }}
            >
                <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex min-w-0 items-center gap-2 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                        <Link
                            href="/admin"
                            className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        >
                            Admin
                        </Link>
                        <Link
                            href="/"
                            className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
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

                <div className="mt-6">
                    <IssueReportsClient groups={groups} />
                </div>
            </main>
        </div>
    );
}
