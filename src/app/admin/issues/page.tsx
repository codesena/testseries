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
                    imageUrls: true,
                    options: true,
                    subject: { select: { name: true } },
                },
            },
        },
    });

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
                attemptId: string;
                studentName: string | null;
                studentUsername: string | null;
                testTitle: string | null;
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
            studentName: r.user?.name ?? null,
            studentUsername: r.user?.username ?? null,
            testTitle: r.attempt?.test?.title ?? null,
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

                <div className="mt-6">
                    <IssueReportsClient groups={groups} />
                </div>
            </main>
        </div>
    );
}
