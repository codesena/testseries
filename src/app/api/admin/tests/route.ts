import { MarkingSchemeType, Prisma } from "@prisma/client";
import { getAuthUser } from "@/server/auth";
import { isAdminUsername } from "@/server/admin";
import { prisma } from "@/server/db";
import { json } from "@/server/json";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Question = z.object({ subjectId: z.number().int(), topicName: z.string().min(1), questionText: z.string().min(1), imageUrls: z.unknown().nullable().optional(), options: z.unknown(), correctAnswer: z.unknown(), markingSchemeType: z.nativeEnum(MarkingSchemeType), difficultyRank: z.number().int().nullable().optional(), orderIndex: z.number().int().nonnegative().optional() });
const Paper = z.object({ title: z.string().min(1).max(256), totalDurationMinutes: z.number().int().positive(), isAdvancedFormat: z.boolean().optional(), questions: z.array(Question) });

async function gate() {
    const auth = await getAuthUser();
    if (!auth) return { ok: false as const, res: json({ error: "Unauthorized" }, { status: 401 }) };
    if (!isAdminUsername(auth.username)) return { ok: false as const, res: json({ error: "Forbidden" }, { status: 403 }) };
    return { ok: true as const };
}

export async function POST(req: Request) {
    const access = await gate();
    if (!access.ok) return access.res;
    const body = Paper.safeParse(await req.json().catch(() => null));
    if (!body.success) return json({ error: "Invalid paper JSON", details: body.error.flatten() }, { status: 400 });
    try {
        const created = await prisma.$transaction(async (tx) => {
            const test = await tx.testSeries.create({ data: { title: body.data.title, totalDurationMinutes: body.data.totalDurationMinutes, isAdvancedFormat: body.data.isAdvancedFormat ?? false }, select: { id: true } });
            for (const [index, item] of body.data.questions.entries()) {
                const imageUrls: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput = item.imageUrls == null ? Prisma.JsonNull : item.imageUrls as Prisma.InputJsonValue;
                const question = await tx.question.create({ data: { subjectId: item.subjectId, topicName: item.topicName, questionText: item.questionText, imageUrls, options: item.options as Prisma.InputJsonValue, correctAnswer: item.correctAnswer as Prisma.InputJsonValue, markingSchemeType: item.markingSchemeType, difficultyRank: item.difficultyRank ?? null }, select: { id: true } });
                await tx.testQuestion.create({ data: { testId: test.id, questionId: question.id, orderIndex: item.orderIndex ?? index } });
            }
            return test;
        });
        return json({ ok: true, testId: created.id }, { status: 201 });
    } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Failed to create paper" }, { status: 400 });
    }
}
