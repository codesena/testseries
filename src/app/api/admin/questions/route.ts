import { getAuthUser } from "@/server/auth";
import { isAdminUsername } from "@/server/admin";
import { prisma } from "@/server/db";
import { json } from "@/server/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toInt(value: string | null, fallback: number): number {
    if (!value) return fallback;
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.floor(n);
}

function looksLikeUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(req: Request) {
    const auth = await getAuthUser();
    if (!auth) return json({ error: "Unauthorized" }, { status: 401 });
    if (!isAdminUsername(auth.username)) return json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const testIdRaw = (url.searchParams.get("testId") ?? "").trim();
    const limit = Math.min(Math.max(toInt(url.searchParams.get("limit"), 120), 1), 400);

    const tests = await prisma.testSeries.findMany({
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, createdAt: true },
    });

    const selectedTestId = tests.some((t) => t.id === testIdRaw)
        ? testIdRaw
        : (tests[0]?.id ?? "");

    if (!selectedTestId) {
        return json({ tests: [], selectedTestId: "", questions: [] });
    }

    const testQuestions = await prisma.testQuestion.findMany({
        where: {
            testId: selectedTestId,
            ...(q
                ? {
                    OR: [
                        ...(looksLikeUuid(q) ? [{ questionId: q }] : []),
                        { question: { topicName: { contains: q, mode: "insensitive" } } },
                        { question: { questionText: { contains: q, mode: "insensitive" } } },
                    ],
                }
                : {}),
        },
        orderBy: { orderIndex: "asc" },
        take: limit,
        select: {
            orderIndex: true,
            question: {
                select: {
                    id: true,
                    subjectId: true,
                    topicName: true,
                    questionText: true,
                    markingSchemeType: true,
                    difficultyRank: true,
                    subject: { select: { name: true } },
                },
            },
        },
    });

    const questionIds = testQuestions.map((x) => x.question.id);

    const [studentIssueRows, adminIssueRows] = await Promise.all([
        questionIds.length
            ? prisma.questionIssueReport.findMany({
                where: { questionId: { in: questionIds } },
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    questionId: true,
                    createdAt: true,
                    issue: true,
                    details: true,
                    attemptId: true,
                    user: { select: { name: true, username: true } },
                    attempt: { select: { studentId: true } },
                },
            })
            : Promise.resolve([]),
        questionIds.length
            ? prisma.adminQuestionIssueReport.findMany({
                where: { questionId: { in: questionIds } },
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    questionId: true,
                    createdAt: true,
                    issue: true,
                    details: true,
                    user: { select: { name: true, username: true } },
                },
            })
            : Promise.resolve([]),
    ]);

    const attemptOwnerIds = Array.from(
        new Set(
            studentIssueRows
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

    const issuesByQuestionId = new Map<
        string,
        Array<{
            id: string;
            source: "student" | "admin";
            createdAt: string;
            issue: string;
            details: string | null;
            reporterName: string | null;
            reporterUsername: string | null;
            attemptId: string | null;
            attemptOwnerName: string | null;
            attemptOwnerUsername: string | null;
        }>
    >();

    for (const row of studentIssueRows) {
        const list = issuesByQuestionId.get(row.questionId) ?? [];
        const owner = row.attempt?.studentId ? attemptOwnerById.get(row.attempt.studentId) : null;
        list.push({
            id: String(row.id),
            source: "student",
            createdAt: row.createdAt.toISOString(),
            issue: row.issue,
            details: row.details,
            reporterName: row.user?.name ?? null,
            reporterUsername: row.user?.username ?? null,
            attemptId: row.attemptId,
            attemptOwnerName: owner?.name ?? null,
            attemptOwnerUsername: owner?.username ?? null,
        });
        issuesByQuestionId.set(row.questionId, list);
    }

    for (const row of adminIssueRows) {
        const list = issuesByQuestionId.get(row.questionId) ?? [];
        list.push({
            id: `admin-${String(row.id)}`,
            source: "admin",
            createdAt: row.createdAt.toISOString(),
            issue: row.issue,
            details: row.details,
            reporterName: row.user?.name ?? null,
            reporterUsername: row.user?.username ?? null,
            attemptId: null,
            attemptOwnerName: null,
            attemptOwnerUsername: null,
        });
        issuesByQuestionId.set(row.questionId, list);
    }

    for (const [qid, list] of issuesByQuestionId) {
        list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        issuesByQuestionId.set(qid, list);
    }

    return json({
        tests,
        selectedTestId,
        questions: testQuestions.map((row) => {
            const qItem = row.question;
            const issues = issuesByQuestionId.get(qItem.id) ?? [];
            return {
                id: qItem.id,
                orderIndex: row.orderIndex,
                subjectId: qItem.subjectId,
                subjectName: qItem.subject.name,
                topicName: qItem.topicName,
                markingSchemeType: qItem.markingSchemeType,
                difficultyRank: qItem.difficultyRank,
                previewText: qItem.questionText.slice(0, 120),
                issueCount: issues.length,
                issues,
            };
        }),
    });
}
