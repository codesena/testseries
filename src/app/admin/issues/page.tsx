import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getAuthUser } from "@/server/auth";
import { isAdminUsername } from "@/server/admin";
import { IssueReportsClient } from "@/components/admin/IssueReportsClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function coerceImageUrls(value: unknown): string[] | null {
    if (!Array.isArray(value)) return null;
    return value.map(String).map((item) => item.trim()).filter(Boolean);
}

export default async function AdminIssueReportsPage() {
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
                    <div className="max-w-5xl mx-auto px-3 sm:px-4 py-1.5">
                        <div className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 flex items-center gap-2">
                                    <div
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold shrink-0"
                                        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                    >
                                        A
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-sm sm:text-base font-semibold leading-none">Admin Panel</div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    <Link
                                        href="/"
                                        className="inline-flex items-center justify-center h-8 rounded-full border px-2.5 text-[11px] whitespace-nowrap ui-click"
                                        style={{ borderColor: "var(--border)", background: "transparent" }}
                                    >
                                        Home
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                <main className="max-w-5xl mx-auto w-full px-4 py-8">
                    <div
                        className="rounded-2xl border p-4"
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
                imageUrls: coerceImageUrls(r.question?.imageUrls),
                options: r.question?.options ?? null,
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
                imageUrls: coerceImageUrls(r.question?.imageUrls),
                options: r.question?.options ?? null,
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
                className="sticky top-0 z-50 border-b backdrop-blur-md"
                style={{
                    borderColor: "var(--border)",
                    background: "color-mix(in srgb, var(--background) 88%, transparent)",
                }}
            >
                <div className="max-w-5xl mx-auto px-3 sm:px-4 py-1.5">
                    <div className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex items-center gap-2">
                                <div
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold shrink-0"
                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                >
                                    A
                                </div>
                                <div className="min-w-0">
                                    <div className="text-sm sm:text-base font-semibold leading-none">Admin Panel</div>
                                    <div className="hidden sm:block text-[11px] leading-tight" style={{ color: "var(--foreground)", opacity: 0.8 }}>
                                        Candidate reports and issue monitoring
                                    </div>
                                </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-2 overflow-x-auto whitespace-nowrap pr-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                                <Link
                                    href="/"
                                    className="inline-flex w-auto shrink-0 items-center justify-center h-8 rounded-full border px-2.5 sm:px-3 text-[11px] sm:text-xs whitespace-nowrap ui-click"
                                    style={{ borderColor: "var(--border)", background: "transparent" }}
                                >
                                    <span className="mr-1 hidden sm:inline-flex" aria-hidden>
                                        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M3 9.5L10 4l7 5.5" />
                                            <path d="M5.5 8.8V16h9V8.8" />
                                        </svg>
                                    </span>
                                    Home
                                </Link>
                                <Link
                                    href="/admin"
                                    className="inline-flex w-auto shrink-0 items-center justify-center h-8 rounded-full border px-2.5 sm:px-3 text-[11px] sm:text-xs whitespace-nowrap ui-click"
                                    style={{ borderColor: "var(--border)", background: "transparent" }}
                                >
                                    <span className="mr-1 hidden sm:inline-flex" aria-hidden>
                                        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M4.5 15.5h11" />
                                            <circle cx="7" cy="8" r="1.5" />
                                            <circle cx="13" cy="8" r="1.5" />
                                        </svg>
                                    </span>
                                    Candidates
                                </Link>
                                <Link
                                    href="/admin/consolidated"
                                    className="inline-flex w-auto shrink-0 items-center justify-center h-8 rounded-full border px-2.5 sm:px-3 text-[11px] sm:text-xs whitespace-nowrap ui-click"
                                    style={{ borderColor: "var(--border)", background: "transparent" }}
                                >
                                    <span className="mr-1 hidden sm:inline-flex" aria-hidden>
                                        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M4 15h12" />
                                            <path d="M6 13V9" />
                                            <path d="M10 13V6" />
                                            <path d="M14 13V10" />
                                        </svg>
                                    </span>
                                    Consolidated
                                </Link>
                                <Link
                                    href="/admin/papers"
                                    className="inline-flex w-auto shrink-0 items-center justify-center h-8 rounded-full border px-2.5 sm:px-3 text-[11px] sm:text-xs whitespace-nowrap ui-click"
                                    style={{ borderColor: "var(--border)", background: "transparent" }}
                                >
                                    <span className="mr-1 hidden sm:inline-flex" aria-hidden>
                                        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M6 3.8h5.8L15 7v9.2H6z" />
                                            <path d="M11.8 3.8V7H15" />
                                        </svg>
                                    </span>
                                    Papers
                                </Link>
                                <Link
                                    href="/admin/issues"
                                    className="inline-flex w-auto shrink-0 items-center justify-center h-8 rounded-full border px-2.5 sm:px-3 text-[11px] sm:text-xs whitespace-nowrap ui-click"
                                    style={{
                                        borderColor: "rgba(59, 130, 246, 0.5)",
                                        background: "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(14,165,233,0.9))",
                                        color: "#e0f2fe",
                                    }}
                                >
                                    <span className="mr-1 hidden sm:inline-flex" aria-hidden>
                                        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="10" cy="10" r="7" />
                                            <path d="M10 6.8v4.4" />
                                            <path d="M10 14.5h.01" />
                                        </svg>
                                    </span>
                                    Issues
                                </Link>
                            </div>
                        </div>
                    </div>
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
