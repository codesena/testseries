import { prisma } from "@/server/db";
import { getAuthUser } from "@/server/auth";
import { isAdminUsername } from "@/server/admin";
import { autoSubmitAttemptIfOverdue } from "@/server/attempt-finalize";
import { evaluateResponse } from "@/server/evaluate";
import { json } from "@/server/json";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ attemptId: z.string().uuid() });

function normalizeDisplayText(value: string) {
    let s = value.trim();

    // Common CSV/Notion artifacts
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        s = s.slice(1, -1).trim();
    }

    // Convert control characters (often introduced by bad JSON-escape parsing like \t or \f)
    // back into literal backslash sequences so MathJax sees \tan / \frac instead of tabs/formfeeds.
    s = s.replace(/\u000c/g, "\\f"); // form feed
    s = s.replace(/\t/g, "\\t");

    // Minimal unescape for leftover artifacts (avoid \n -> newline, which can break LaTeX like \nu)
    s = s.replace(/\\\"/g, '"');
    s = s.replace(/\\'/g, "'");

    // If LaTeX delimiters are unbalanced, escape $ to avoid MathJax "Math input error".
    const dollarCount = (s.match(/\$/g) ?? []).length;
    if (dollarCount % 2 === 1) {
        s = s.replace(/\$/g, "\\$");
    }

    return s.trim();
}

function normalizeMaybeText(value: unknown): string {
    return typeof value === "string" ? normalizeDisplayText(value) : "";
}

function coerceQuestionOptions(value: unknown): Array<{ key: string; text: string; imageUrl: string | null }> {
    let parsed = value;

    if (typeof parsed === "string") {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            return [];
        }
    }

    if (Array.isArray(parsed)) {
        const out: Array<{ key: string; text: string; imageUrl: string | null }> = [];
        for (const item of parsed) {
            if (!item || typeof item !== "object") continue;
            const maybeKey = (item as { key?: unknown }).key;
            if (typeof maybeKey !== "string") continue;
            const maybeText = (item as { text?: unknown }).text;
            const maybeImageUrl = (item as { imageUrl?: unknown }).imageUrl;
            out.push({
                key: maybeKey,
                text: normalizeMaybeText(maybeText),
                imageUrl: typeof maybeImageUrl === "string" ? maybeImageUrl.trim() : null,
            });
        }
        return out;
    }

    if (parsed && typeof parsed === "object") {
        return Object.entries(parsed as Record<string, unknown>).map(([key, raw]) => {
            if (typeof raw === "string") {
                return { key, text: normalizeDisplayText(raw), imageUrl: null as string | null };
            }

            if (raw && typeof raw === "object") {
                const maybeText = (raw as { text?: unknown }).text;
                const maybeImageUrl = (raw as { imageUrl?: unknown }).imageUrl;
                return {
                    key,
                    text: normalizeMaybeText(maybeText),
                    imageUrl: typeof maybeImageUrl === "string" ? maybeImageUrl.trim() : null,
                };
            }

            return { key, text: "", imageUrl: null as string | null };
        });
    }

    return [];
}

function isAttemptedAnswer(value: unknown): boolean {
    if (value == null) return false;
    if (typeof value === "string" && value.trim() === "") return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
}

type ReflectionPayload = {
    kind: "REPORT_REFLECTION";
    wrongReason?: unknown;
    leftReason?: unknown;
    slowReason?: unknown;
};

function asTrimmedStringOrNull(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const s = value.trim();
    return s ? s : null;
}

function readReflectionPayload(value: unknown): ReflectionPayload | null {
    if (!value || typeof value !== "object") return null;
    const obj = value as Record<string, unknown>;
    if (obj.kind !== "REPORT_REFLECTION") return null;
    return {
        kind: "REPORT_REFLECTION",
        wrongReason: obj.wrongReason,
        leftReason: obj.leftReason,
        slowReason: obj.slowReason,
    };
}

export async function GET(
    _req: Request,
    ctx: { params: Promise<{ attemptId: string }> },
) {
    const auth = await getAuthUser();
    if (!auth) {
        return json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin = isAdminUsername(auth.username);

    const params = ParamsSchema.safeParse(await ctx.params);
    if (!params.success) {
        return json({ error: "Invalid attempt id" }, { status: 400 });
    }

    const attempt = await prisma.studentAttempt.findFirst({
        where: isAdmin
            ? { id: params.data.attemptId }
            : { id: params.data.attemptId, studentId: auth.userId },
        select: {
            id: true,
            studentId: true,
            status: true,
            overallScore: true,
            startTimestamp: true,
            endTimestamp: true,
            test: { select: { id: true, title: true, totalDurationMinutes: true } },
            questionOrder: true,
            optionOrders: true,
            responses: {
                select: {
                    questionId: true,
                    selectedAnswer: true,
                    timeSpentSeconds: true,
                    paletteStatus: true,
                },
            },
            activities: {
                where: {
                    type: { in: ["QUESTION_LOAD", "NAVIGATE", "PALETTE_CLICK"] },
                },
                orderBy: { createdAt: "asc" },
                select: { type: true, questionId: true, createdAt: true },
            },
        },
    });

    if (!attempt) {
        return json({ error: "Attempt not found" }, { status: 404 });
    }

    await autoSubmitAttemptIfOverdue(prisma, {
        id: attempt.id,
        status: attempt.status,
        startTimestamp: attempt.startTimestamp,
        test: { totalDurationMinutes: attempt.test.totalDurationMinutes },
        responses: attempt.responses.map((r) => ({
            questionId: r.questionId,
            selectedAnswer: r.selectedAnswer,
        })),
    });

    const student = await prisma.user.findUnique({
        where: { id: attempt.studentId },
        select: { name: true },
    });

    const storedQuestionOrder = Array.isArray(attempt.questionOrder)
        ? (attempt.questionOrder as unknown[]).map(String)
        : [];

    const optionOrders =
        attempt.optionOrders && typeof attempt.optionOrders === "object"
            ? (attempt.optionOrders as Record<string, string[]>)
            : {};

    // Prefer the test's defined order so questions are sequential by section,
    // even if older attempts stored a randomized order.
    let questionOrder = storedQuestionOrder;
    const testOrder = await prisma.testQuestion.findMany({
        where: { testId: attempt.test.id },
        orderBy: { orderIndex: "asc" },
        select: { questionId: true },
    });
    const testQuestionOrder = testOrder.map((x) => x.questionId);
    if (testQuestionOrder.length) {
        const storedSet = new Set(storedQuestionOrder);
        const allPresent = testQuestionOrder.every((qid) => storedSet.has(qid));
        if (allPresent) questionOrder = testQuestionOrder;
    }

    const questionIds = questionOrder.length ? questionOrder : attempt.responses.map((r) => r.questionId);
    const questions = await prisma.question.findMany({
        where: { id: { in: questionIds } },
        select: {
            id: true,
            topicName: true,
            questionText: true,
            imageUrls: true,
            options: true,
            correctAnswer: true,
            markingSchemeType: true,
            subject: { select: { name: true } },
        },
    });
    const byId = new Map(questions.map((q) => [q.id, q] as const));

    const responsesByQid = new Map(attempt.responses.map((r) => [r.questionId, r] as const));
    const reflectionActivities = await prisma.activityLog.findMany({
        where: {
            attemptId: attempt.id,
            type: "SUBMIT",
            questionId: { not: null },
        },
        orderBy: { createdAt: "desc" },
        select: { questionId: true, payload: true, createdAt: true },
    });
    const reflectionsByQid = new Map<
        string,
        {
            wrongReason: string | null;
            leftReason: string | null;
            slowReason: string | null;
            savedAt: Date;
        }
    >();

    for (const item of reflectionActivities) {
        const qid = item.questionId;
        if (!qid) continue;
        if (reflectionsByQid.has(qid)) continue;

        const payload = readReflectionPayload(item.payload);
        if (!payload) continue;

        reflectionsByQid.set(qid, {
            wrongReason: asTrimmedStringOrNull(payload.wrongReason),
            leftReason: asTrimmedStringOrNull(payload.leftReason),
            slowReason: asTrimmedStringOrNull(payload.slowReason),
            savedAt: item.createdAt,
        });
    }

    const subjectAgg: Record<
        string,
        { totalTimeSeconds: number; correct: number; incorrect: number; unattempted: number }
    > = {};

    const topicAgg: Record<string, { correct: number; total: number }> = {};

    let timeCorrect = 0;
    let timeIncorrect = 0;

    const totalTimeSeconds = attempt.responses.reduce(
        (acc, r) => acc + r.timeSpentSeconds,
        0,
    );

    const perQuestionOrdered = questionIds.map((qid) => {
        const q = byId.get(qid);
        if (!q) return null;

        const r = responsesByQid.get(qid);
        const selectedAnswer = r?.selectedAnswer ?? null;
        const timeSpentSeconds = r?.timeSpentSeconds ?? 0;
        const paletteStatus = r?.paletteStatus ?? "NOT_VISITED";

        const marks = evaluateResponse({
            userAnswer: selectedAnswer,
            correctAnswer: q.correctAnswer,
            schemeType: q.markingSchemeType,
        });

        const attempted = isAttemptedAnswer(selectedAnswer);
        const correct = attempted && marks > 0;
        const reflection = reflectionsByQid.get(qid) ?? null;

        const subject = q.subject.name;
        subjectAgg[subject] ??= {
            totalTimeSeconds: 0,
            correct: 0,
            incorrect: 0,
            unattempted: 0,
        };
        subjectAgg[subject].totalTimeSeconds += timeSpentSeconds;
        if (!attempted) subjectAgg[subject].unattempted += 1;
        else if (correct) subjectAgg[subject].correct += 1;
        else subjectAgg[subject].incorrect += 1;

        const topicName = normalizeMaybeText(q.topicName) || "Unknown";
        topicAgg[topicName] ??= { correct: 0, total: 0 };
        topicAgg[topicName].total += 1;
        if (correct) topicAgg[topicName].correct += 1;

        if (correct) timeCorrect += timeSpentSeconds;
        else if (attempted) timeIncorrect += timeSpentSeconds;

        const parsedOptions = coerceQuestionOptions(q.options);
        const parsedByKey = new Map(parsedOptions.map((o) => [o.key, o] as const));
        const fallbackOrder = parsedOptions.map((o) => o.key);
        const order = Array.isArray(optionOrders[qid]) ? optionOrders[qid] : fallbackOrder;
        const orderedOptions = order
            .map((k) => parsedByKey.get(k))
            .filter((o): o is { key: string; text: string; imageUrl: string | null } => Boolean(o));

        return {
            questionId: qid,
            subject,
            topicName,
            questionText: normalizeMaybeText(q.questionText),
            imageUrls: Array.isArray(q.imageUrls) ? (q.imageUrls as unknown[]).map(String) : null,
            options: orderedOptions,
            markingSchemeType: q.markingSchemeType,
            selectedAnswer,
            correctAnswer: q.correctAnswer,
            timeSpentSeconds,
            attempted,
            correct,
            paletteStatus,
            marks,
            reflection: reflection
                ? {
                    wrongReason: reflection.wrongReason,
                    leftReason: reflection.leftReason,
                    slowReason: reflection.slowReason,
                    savedAt: reflection.savedAt,
                }
                : null,
        };
    });

    const attemptPath = attempt.activities
        .filter((a) => a.questionId)
        .map((a) => ({
            type: a.type,
            questionId: a.questionId as string,
            at: a.createdAt,
        }));

    const topicAccuracy = Object.entries(topicAgg)
        .map(([topic, v]) => ({
            topic,
            accuracy: v.total === 0 ? 0 : v.correct / v.total,
            correct: v.correct,
            total: v.total,
        }))
        .sort((a, b) => a.accuracy - b.accuracy);

    return json({
        attempt: {
            id: attempt.id,
            studentId: attempt.studentId,
            studentName: student?.name ?? null,
            status: attempt.status,
            score: attempt.overallScore,
            startTimestamp: attempt.startTimestamp,
            endTimestamp: attempt.endTimestamp,
            test: attempt.test,
        },
        analytics: {
            subjectSummary: subjectAgg,
            totalTimeSeconds,
            timeOnCorrectSeconds: timeCorrect,
            timeOnIncorrectSeconds: timeIncorrect,
            attemptPath,
            topicAccuracy,
            perQuestion: perQuestionOrdered.filter(Boolean),
        },
    });
}
