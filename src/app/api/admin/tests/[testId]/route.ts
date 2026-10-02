import { MarkingSchemeType, Prisma } from "@prisma/client";
import { getAuthUser } from "@/server/auth";
import { isAdminUsername } from "@/server/admin";
import { prisma } from "@/server/db";
import { json } from "@/server/json";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Params = z.object({ testId: z.string().uuid() });
const Question = z.object({
    id: z.string().uuid().optional(),
    subjectId: z.number().int(),
    subjectName: z.string().optional(),
    topicName: z.string().trim().min(1),
    questionText: z.string().trim().min(1),
    imageUrls: z.unknown().nullable().optional(),
    options: z.unknown(),
    correctAnswer: z.unknown(),
    markingSchemeType: z.nativeEnum(MarkingSchemeType),
    difficultyRank: z.number().int().nullable().optional(),
    orderIndex: z.number().int().nonnegative().optional(),
});
const Paper = z.object({
    title: z.string().trim().min(1).max(256),
    totalDurationMinutes: z.number().int().positive(),
    isAdvancedFormat: z.boolean().optional(),
    questions: z.array(Question),
});

async function gate() {
    const auth = await getAuthUser();
    if (!auth) return { ok: false as const, res: json({ error: "Unauthorized" }, { status: 401 }) };
    if (!isAdminUsername(auth.username)) return { ok: false as const, res: json({ error: "Forbidden" }, { status: 403 }) };
    return { ok: true as const };
}

export async function GET(_req: Request, ctx: { params: Promise<{ testId: string }> }) {
    const access = await gate();
    if (!access.ok) return access.res;
    const params = Params.safeParse(await ctx.params);
    if (!params.success) return json({ error: "Invalid test id" }, { status: 400 });
    const test = await prisma.testSeries.findUnique({
        where: { id: params.data.testId },
        select: {
            id: true, title: true, totalDurationMinutes: true, isAdvancedFormat: true,
            questions: { orderBy: { orderIndex: "asc" }, select: {
                orderIndex: true,
                question: { select: { id: true, subjectId: true, topicName: true, questionText: true, imageUrls: true, options: true, correctAnswer: true, markingSchemeType: true, difficultyRank: true, subject: { select: { name: true } } } },
            } },
        },
    });
    if (!test) return json({ error: "Test not found" }, { status: 404 });
    return json({ paper: { id: test.id, title: test.title, totalDurationMinutes: test.totalDurationMinutes, isAdvancedFormat: test.isAdvancedFormat, questions: test.questions.map((link) => ({ ...link.question, subjectName: link.question.subject.name, orderIndex: link.orderIndex })) } });
}

export async function PUT(req: Request, ctx: { params: Promise<{ testId: string }> }) {
    const access = await gate();
    if (!access.ok) return access.res;
    const params = Params.safeParse(await ctx.params);
    if (!params.success) return json({ error: "Invalid test id" }, { status: 400 });
    const body = Paper.safeParse(await req.json().catch(() => null));
    if (!body.success) return json({ error: "Invalid paper JSON", details: body.error.flatten() }, { status: 400 });
    try {
        const result = await prisma.$transaction(async (tx) => {
            const existing = await tx.testSeries.findUnique({ where: { id: params.data.testId }, select: { id: true } });
            if (!existing) throw new Error("Test not found");
            const questionIds: string[] = [];
            for (const [index, item] of body.data.questions.entries()) {
                const imageUrls: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput = item.imageUrls == null ? Prisma.JsonNull : item.imageUrls as Prisma.InputJsonValue;
                const data = { subjectId: item.subjectId, topicName: item.topicName, questionText: item.questionText, imageUrls, options: item.options as Prisma.InputJsonValue, correctAnswer: item.correctAnswer as Prisma.InputJsonValue, markingSchemeType: item.markingSchemeType, difficultyRank: item.difficultyRank ?? null };
                const question = item.id
                    ? await tx.question.update({ where: { id: item.id }, data, select: { id: true } })
                    : await tx.question.create({ data, select: { id: true } });
                questionIds.push(question.id);
                await tx.testQuestion.deleteMany({ where: { testId: params.data.testId, questionId: question.id } });
                await tx.testQuestion.create({ data: { testId: params.data.testId, questionId: question.id, orderIndex: item.orderIndex ?? index } });
            }
            await tx.testSeries.update({ where: { id: params.data.testId }, data: { title: body.data.title, totalDurationMinutes: body.data.totalDurationMinutes, isAdvancedFormat: body.data.isAdvancedFormat } });
            await tx.testQuestion.deleteMany({ where: { testId: params.data.testId, ...(questionIds.length ? { questionId: { notIn: questionIds } } : {}) } });
            return { questionCount: questionIds.length };
        });
        return json({ ok: true, ...result });
    } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Failed to save paper" }, { status: 400 });
    }
}
