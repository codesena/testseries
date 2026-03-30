import { MarkingSchemeType, Prisma } from "@prisma/client";
import { getAuthUser } from "@/server/auth";
import { isAdminUsername } from "@/server/admin";
import { prisma } from "@/server/db";
import { json } from "@/server/json";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ questionId: z.string().uuid() });

const UpdateSchema = z.object({
    subjectId: z.number().int(),
    topicName: z.string().trim().min(1).max(400),
    questionText: z.string().trim().min(1),
    imageUrls: z.unknown().nullable(),
    options: z.unknown(),
    correctAnswer: z.unknown(),
    markingSchemeType: z.nativeEnum(MarkingSchemeType),
    difficultyRank: z.number().int().nullable(),
});

async function ensureAdmin() {
    const auth = await getAuthUser();
    if (!auth) return { ok: false as const, res: json({ error: "Unauthorized" }, { status: 401 }) };
    if (!isAdminUsername(auth.username)) {
        return { ok: false as const, res: json({ error: "Forbidden" }, { status: 403 }) };
    }
    return { ok: true as const };
}

export async function GET(
    _req: Request,
    ctx: { params: Promise<{ questionId: string }> },
) {
    const gate = await ensureAdmin();
    if (!gate.ok) return gate.res;

    const params = ParamsSchema.safeParse(await ctx.params);
    if (!params.success) return json({ error: "Invalid question id" }, { status: 400 });

    const question = await prisma.question.findUnique({
        where: { id: params.data.questionId },
        select: {
            id: true,
            subjectId: true,
            topicName: true,
            questionText: true,
            imageUrls: true,
            options: true,
            correctAnswer: true,
            markingSchemeType: true,
            difficultyRank: true,
            subject: { select: { name: true } },
        },
    });

    if (!question) return json({ error: "Question not found" }, { status: 404 });

    return json({
        question: {
            ...question,
            subjectName: question.subject.name,
        },
    });
}

export async function PUT(
    req: Request,
    ctx: { params: Promise<{ questionId: string }> },
) {
    const gate = await ensureAdmin();
    if (!gate.ok) return gate.res;

    const params = ParamsSchema.safeParse(await ctx.params);
    if (!params.success) return json({ error: "Invalid question id" }, { status: 400 });

    const body = UpdateSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
        return json({ error: "Invalid request", details: body.error.flatten() }, { status: 400 });
    }

    const subject = await prisma.subjectCategory.findUnique({
        where: { id: body.data.subjectId },
        select: { id: true },
    });
    if (!subject) return json({ error: "Invalid subjectId" }, { status: 400 });

    if (body.data.options == null || body.data.correctAnswer == null) {
        return json({ error: "options and correctAnswer are required" }, { status: 400 });
    }

    const imageUrlsInput: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput =
        body.data.imageUrls === null
            ? Prisma.JsonNull
            : (body.data.imageUrls as Prisma.InputJsonValue);

    const updated = await prisma.question.update({
        where: { id: params.data.questionId },
        data: {
            subjectId: body.data.subjectId,
            topicName: body.data.topicName,
            questionText: body.data.questionText,
            imageUrls: imageUrlsInput,
            options: body.data.options as Prisma.InputJsonValue,
            correctAnswer: body.data.correctAnswer as Prisma.InputJsonValue,
            markingSchemeType: body.data.markingSchemeType,
            difficultyRank: body.data.difficultyRank,
        },
        select: {
            id: true,
            subjectId: true,
            topicName: true,
            questionText: true,
            imageUrls: true,
            options: true,
            correctAnswer: true,
            markingSchemeType: true,
            difficultyRank: true,
            subject: { select: { name: true } },
        },
    });

    return json({
        ok: true,
        question: {
            ...updated,
            subjectName: updated.subject.name,
        },
    });
}
