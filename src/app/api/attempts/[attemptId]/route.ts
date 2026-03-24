import { prisma } from "@/server/db";
import { getAuthUserId } from "@/server/auth";
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
    s = s.replace(/\\"/g, '"');
    s = s.replace(/\\'/g, "'");

    // If LaTeX delimiters are unbalanced, escape $ to avoid MathJax "Math input error".
    const dollarCount = (s.match(/\$/g) ?? []).length;
    if (dollarCount % 2 === 1) {
        s = s.replace(/\$/g, "\\$");
    }

    return s.trim();
}

export async function GET(
    _req: Request,
    ctx: { params: Promise<{ attemptId: string }> },
) {
    const userId = await getAuthUserId();
    if (!userId) {
        return json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
    });

    const params = ParamsSchema.safeParse(await ctx.params);
    if (!params.success) {
        return json({ error: "Invalid attempt id" }, { status: 400 });
    }

    const attempt = await prisma.studentAttempt.findFirst({
        where: { id: params.data.attemptId, studentId: userId },
        select: {
            id: true,
            status: true,
            startTimestamp: true,
            test: {
                select: { id: true, title: true, totalDurationMinutes: true },
            },
            questionOrder: true,
            optionOrders: true,
            responses: {
                select: {
                    questionId: true,
                    selectedAnswer: true,
                    paletteStatus: true,
                    timeSpentSeconds: true,
                    lastUpdated: true,
                },
            },
        },
    });

    if (!attempt) {
        return json({ error: "Attempt not found" }, { status: 404 });
    }

    const storedQuestionOrder = attempt.questionOrder as string[];
    const optionOrders = attempt.optionOrders as Record<string, string[]>;

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

    const questions = await prisma.question.findMany({
        where: { id: { in: questionOrder } },
        select: {
            id: true,
            subject: { select: { id: true, name: true } },
            topicName: true,
            questionText: true,
            imageUrls: true,
            options: true,
            markingSchemeType: true,
        },
    });
    const byId = new Map(questions.map((q) => [q.id, q] as const));

    const orderedQuestions = questionOrder
        .map((qid) => {
            const q = byId.get(qid);
            if (!q) return null;

            const options = q.options as Record<string, unknown>;
            const order = optionOrders[qid] ?? Object.keys(options);
            const orderedOptions = order
                .filter((k) => k in options)
                .map((k) => {
                    const raw = options[k];
                    if (typeof raw === "string") {
                        return { key: k, text: normalizeDisplayText(raw), imageUrl: null as string | null };
                    }
                    if (raw && typeof raw === "object") {
                        const maybeText = (raw as { text?: unknown }).text;
                        const maybeImageUrl = (raw as { imageUrl?: unknown }).imageUrl;
                        return {
                            key: k,
                            text: typeof maybeText === "string" ? normalizeDisplayText(maybeText) : "",
                            imageUrl:
                                typeof maybeImageUrl === "string" ? maybeImageUrl.trim() : null,
                        };
                    }
                    return { key: k, text: "", imageUrl: null as string | null };
                });

            return {
                id: q.id,
                subject: q.subject,
                topicName: normalizeDisplayText(q.topicName),
                questionText: normalizeDisplayText(q.questionText),
                imageUrls: Array.isArray(q.imageUrls)
                    ? (q.imageUrls as unknown[]).map(String)
                    : null,
                options: orderedOptions,
                markingSchemeType: q.markingSchemeType,
            };
        })
        .filter(Boolean);

    return json({
        attempt: {
            id: attempt.id,
            status: attempt.status,
            startTimestamp: attempt.startTimestamp,
            test: attempt.test,
            questions: orderedQuestions,
            responses: attempt.responses,
            serverNow: new Date().toISOString(),
            studentName: user?.name ?? null,
        },
    });
}
