import { prisma } from "@/server/db";
import { json } from "@/server/json";
import {
    ensureAdminGate,
    ExamV2UpsertSchema,
    upsertExamV2Graph,
} from "@/server/exam-v2/admin";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({
    examId: z.string().uuid(),
});

const PatchBodySchema = z
    .object({
        isActive: z.boolean().optional(),
        title: z.string().trim().min(3).max(256).optional(),
        instructionsRichText: z.string().max(20000).nullable().optional(),
    })
    .refine((data) => data.isActive !== undefined || data.title !== undefined || data.instructionsRichText !== undefined, {
        message: "At least one field is required",
    });

export async function GET(
    _req: Request,
    ctx: { params: Promise<{ examId: string }> },
) {
    const gate = await ensureAdminGate();
    if (!gate.ok) return gate.res;

    const params = ParamsSchema.safeParse(await ctx.params);
    if (!params.success) return json({ error: "Invalid exam id" }, { status: 400 });

    const exam = await prisma.examV2.findUnique({
        where: { id: params.data.examId },
        select: {
            id: true,
            code: true,
            title: true,
            durationMinutes: true,
            instructionsRichText: true,
            isActive: true,
            createdAt: true,
            subjects: {
                orderBy: { sortOrder: "asc" },
                select: {
                    id: true,
                    subject: true,
                    sortOrder: true,
                    sections: {
                        orderBy: { sortOrder: "asc" },
                        select: {
                            id: true,
                            sectionCode: true,
                            title: true,
                            instructionsRich: true,
                            sortOrder: true,
                            config: true,
                            blocks: {
                                orderBy: { sortOrder: "asc" },
                                select: {
                                    id: true,
                                    blockType: true,
                                    sortOrder: true,
                                    paragraphRich: true,
                                    paragraphAssets: true,
                                    questions: {
                                        orderBy: { createdAt: "asc" },
                                        select: {
                                            id: true,
                                            questionType: true,
                                            stemRich: true,
                                            stemAssets: true,
                                            payload: true,
                                            difficultyRank: true,
                                            createdAt: true,
                                            marksScheme: {
                                                select: {
                                                    id: true,
                                                    name: true,
                                                    questionType: true,
                                                },
                                            },
                                            options: {
                                                orderBy: { sortOrder: "asc" },
                                                select: {
                                                    optionKey: true,
                                                    labelRich: true,
                                                    assets: true,
                                                    sortOrder: true,
                                                    isCorrect: true,
                                                },
                                            },
                                            matchItems: {
                                                orderBy: [{ listName: "asc" }, { sortOrder: "asc" }],
                                                select: {
                                                    listName: true,
                                                    itemKey: true,
                                                    labelRich: true,
                                                    sortOrder: true,
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!exam) return json({ error: "Exam not found" }, { status: 404 });

    return json({ exam });
}

export async function PUT(
    req: Request,
    ctx: { params: Promise<{ examId: string }> },
) {
    const gate = await ensureAdminGate();
    if (!gate.ok) return gate.res;

    const params = ParamsSchema.safeParse(await ctx.params);
    if (!params.success) return json({ error: "Invalid exam id" }, { status: 400 });

    const body = ExamV2UpsertSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
        return json({ error: "Invalid request", details: body.error.flatten() }, { status: 400 });
    }

    const target = await prisma.examV2.findUnique({
        where: { id: params.data.examId },
        select: { id: true },
    });
    if (!target) return json({ error: "Exam not found" }, { status: 404 });

    const codeConflict = await prisma.examV2.findFirst({
        where: {
            code: body.data.code,
            NOT: { id: target.id },
        },
        select: { id: true },
    });
    if (codeConflict) {
        return json({ error: "Exam code already exists" }, { status: 409 });
    }

    try {
        const updated = await prisma.$transaction((tx) =>
            upsertExamV2Graph(tx, body.data, params.data.examId),
        );
        return json({ ok: true, examId: updated.examId, questionCount: updated.questionCount });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update exam";
        return json({ error: message }, { status: 400 });
    }
}

export async function DELETE(
    _req: Request,
    ctx: { params: Promise<{ examId: string }> },
) {
    const gate = await ensureAdminGate();
    if (!gate.ok) return gate.res;

    const params = ParamsSchema.safeParse(await ctx.params);
    if (!params.success) return json({ error: "Invalid exam id" }, { status: 400 });

    const exam = await prisma.examV2.findUnique({
        where: { id: params.data.examId },
        select: {
            id: true,
            code: true,
            _count: {
                select: { attempts: true },
            },
        },
    });

    if (!exam) return json({ error: "Exam not found" }, { status: 404 });

    if (exam._count.attempts > 0) {
        return json(
            {
                error: "Cannot delete exam with attempts",
                attemptCount: exam._count.attempts,
            },
            { status: 409 },
        );
    }

    await prisma.examV2.delete({
        where: { id: exam.id },
        select: { id: true },
    });

    return json({ ok: true, deletedExamId: exam.id, code: exam.code });
}

export async function PATCH(
    req: Request,
    ctx: { params: Promise<{ examId: string }> },
) {
    const gate = await ensureAdminGate();
    if (!gate.ok) return gate.res;

    const params = ParamsSchema.safeParse(await ctx.params);
    if (!params.success) return json({ error: "Invalid exam id" }, { status: 400 });

    const body = PatchBodySchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
        return json({ error: "Invalid request", details: body.error.flatten() }, { status: 400 });
    }

    const exam = await prisma.examV2.findUnique({
        where: { id: params.data.examId },
        select: { id: true, isActive: true },
    });
    if (!exam) return json({ error: "Exam not found" }, { status: 404 });

    const updated = await prisma.examV2.update({
        where: { id: exam.id },
        data: {
            isActive: body.data.isActive,
            title: body.data.title,
            instructionsRichText: body.data.instructionsRichText,
        },
        select: { id: true, isActive: true, title: true, instructionsRichText: true },
    });

    return json({ ok: true, exam: updated });
}
