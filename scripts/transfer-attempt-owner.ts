import "dotenv/config";
import { prisma } from "../src/server/db";

type AttemptKind = "v2" | "legacy" | "auto";

type CliArgs = {
    attemptId: string;
    toUserId?: string;
    toUsername?: string;
    kind: AttemptKind;
};

function isUuidLike(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function findV2AttemptIdsByPrefix(prefix: string): Promise<string[]> {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id::text AS id
        FROM "ExamV2Attempts"
        WHERE id::text LIKE ${`${prefix}%`}
        ORDER BY "startTimestamp" DESC
        LIMIT 2
    `;
    return rows.map((r) => r.id);
}

async function findV2AttemptIdsByFragment(fragment: string): Promise<string[]> {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id::text AS id
        FROM "ExamV2Attempts"
        WHERE id::text LIKE ${`%${fragment}%`}
        ORDER BY "startTimestamp" DESC
        LIMIT 2
    `;
    return rows.map((r) => r.id);
}

async function findLegacyAttemptIdsByPrefix(prefix: string): Promise<string[]> {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id::text AS id
        FROM "StudentAttempts"
        WHERE id::text LIKE ${`${prefix}%`}
        ORDER BY "startTimestamp" DESC
        LIMIT 2
    `;
    return rows.map((r) => r.id);
}

async function findLegacyAttemptIdsByFragment(fragment: string): Promise<string[]> {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id::text AS id
        FROM "StudentAttempts"
        WHERE id::text LIKE ${`%${fragment}%`}
        ORDER BY "startTimestamp" DESC
        LIMIT 2
    `;
    return rows.map((r) => r.id);
}

function parseArgs(argv: string[]): CliArgs {
    const out: CliArgs = {
        attemptId: "",
        kind: "auto",
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const next = argv[i + 1];

        if (arg === "--attemptId" && next) {
            out.attemptId = next.trim();
            i += 1;
            continue;
        }
        if (arg === "--toUserId" && next) {
            out.toUserId = next.trim();
            i += 1;
            continue;
        }
        if (arg === "--toUsername" && next) {
            out.toUsername = next.trim();
            i += 1;
            continue;
        }
        if (arg === "--kind" && next) {
            const v = next.trim().toLowerCase();
            if (v === "v2" || v === "legacy" || v === "auto") {
                out.kind = v;
            } else {
                throw new Error(`Invalid --kind value: ${next}. Use auto|v2|legacy.`);
            }
            i += 1;
            continue;
        }
    }

    if (!out.attemptId) throw new Error("--attemptId is required");
    if (!out.toUserId && !out.toUsername) {
        throw new Error("Provide --toUserId or --toUsername");
    }

    return out;
}

async function resolveTargetUser(args: CliArgs) {
    if (args.toUserId) {
        const user = await prisma.user.findUnique({
            where: { id: args.toUserId },
            select: { id: true, username: true, name: true },
        });
        if (!user) throw new Error(`Target user not found for id: ${args.toUserId}`);
        return user;
    }

    const user = await prisma.user.findUnique({
        where: { username: args.toUsername },
        select: { id: true, username: true, name: true },
    });
    if (!user) throw new Error(`Target user not found for username: ${args.toUsername}`);
    return user;
}

async function transferV2(attemptId: string, toUserId: string) {
    let v2Matches = isUuidLike(attemptId)
        ? [attemptId]
        : await findV2AttemptIdsByPrefix(attemptId);

    if (!isUuidLike(attemptId) && v2Matches.length === 0 && attemptId.length >= 6) {
        v2Matches = await findV2AttemptIdsByFragment(attemptId);
    }

    if (v2Matches.length > 1) {
        return { moved: false as const, reason: "v2-prefix-ambiguous" as const };
    }
    if (v2Matches.length === 0) {
        return { moved: false as const, reason: "v2-attempt-not-found" as const };
    }

    const resolvedAttemptId = v2Matches[0];

    const before = await prisma.examV2Attempt.findUnique({
        where: { id: resolvedAttemptId },
        select: {
            id: true,
            userId: true,
            examId: true,
            status: true,
            submittedAt: true,
            totalScore: true,
            _count: { select: { responses: true, events: true } },
        },
    });

    if (!before) return { moved: false as const, reason: "v2-attempt-not-found" as const };

    if (before.userId === toUserId) {
        return { moved: false as const, reason: "already-owned" as const, before };
    }

    const updated = await prisma.$transaction(async (tx) => {
        return tx.examV2Attempt.update({
            where: { id: resolvedAttemptId },
            data: { userId: toUserId },
            select: {
                id: true,
                userId: true,
                examId: true,
                status: true,
                submittedAt: true,
                totalScore: true,
            },
        });
    });

    return {
        moved: true as const,
        model: "ExamV2Attempt" as const,
        before,
        after: updated,
        stats: {
            responses: before._count.responses,
            events: before._count.events,
        },
    };
}

async function transferLegacy(attemptId: string, toUserId: string) {
    let legacyMatches = isUuidLike(attemptId)
        ? [attemptId]
        : await findLegacyAttemptIdsByPrefix(attemptId);

    if (!isUuidLike(attemptId) && legacyMatches.length === 0 && attemptId.length >= 6) {
        legacyMatches = await findLegacyAttemptIdsByFragment(attemptId);
    }

    if (legacyMatches.length > 1) {
        return { moved: false as const, reason: "legacy-prefix-ambiguous" as const };
    }
    if (legacyMatches.length === 0) {
        return { moved: false as const, reason: "legacy-attempt-not-found" as const };
    }

    const resolvedAttemptId = legacyMatches[0];

    const before = await prisma.studentAttempt.findUnique({
        where: { id: resolvedAttemptId },
        select: {
            id: true,
            studentId: true,
            testId: true,
            status: true,
            endTimestamp: true,
            overallScore: true,
            _count: { select: { responses: true, activities: true, issueReports: true, reflections: true } },
        },
    });

    if (!before) return { moved: false as const, reason: "legacy-attempt-not-found" as const };

    if (before.studentId === toUserId) {
        return { moved: false as const, reason: "already-owned" as const, before };
    }

    const result = await prisma.$transaction(async (tx) => {
        const updatedAttempt = await tx.studentAttempt.update({
            where: { id: resolvedAttemptId },
            data: { studentId: toUserId },
            select: {
                id: true,
                studentId: true,
                testId: true,
                status: true,
                endTimestamp: true,
                overallScore: true,
            },
        });

        const updatedIssueReports = await tx.questionIssueReport.updateMany({
            where: { attemptId: resolvedAttemptId },
            data: { userId: toUserId },
        });

        return {
            updatedAttempt,
            updatedIssueReportsCount: updatedIssueReports.count,
        };
    });

    return {
        moved: true as const,
        model: "StudentAttempt" as const,
        before,
        after: result.updatedAttempt,
        stats: {
            responses: before._count.responses,
            activities: before._count.activities,
            issueReports: before._count.issueReports,
            reflections: before._count.reflections,
            issueReportsUserReassigned: result.updatedIssueReportsCount,
        },
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const targetUser = await resolveTargetUser(args);

    if (args.kind === "v2") {
        const res = await transferV2(args.attemptId, targetUser.id);
        if (!res.moved) throw new Error(`Transfer failed (${res.reason}) for attempt ${args.attemptId}`);
        console.log(JSON.stringify({ ok: true, targetUser, ...res }, null, 2));
        return;
    }

    if (args.kind === "legacy") {
        const res = await transferLegacy(args.attemptId, targetUser.id);
        if (!res.moved) throw new Error(`Transfer failed (${res.reason}) for attempt ${args.attemptId}`);
        console.log(JSON.stringify({ ok: true, targetUser, ...res }, null, 2));
        return;
    }

    const v2 = await transferV2(args.attemptId, targetUser.id);
    if (v2.moved) {
        console.log(JSON.stringify({ ok: true, targetUser, ...v2 }, null, 2));
        return;
    }

    const legacy = await transferLegacy(args.attemptId, targetUser.id);
    if (legacy.moved) {
        console.log(JSON.stringify({ ok: true, targetUser, ...legacy }, null, 2));
        return;
    }

    throw new Error(`Attempt not found in ExamV2Attempt or StudentAttempt for id: ${args.attemptId}`);
}

main()
    .catch((err) => {
        console.error("Transfer failed:", err instanceof Error ? err.message : err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
