import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { json } from "@/server/json";
import { ensureAdminGate } from "@/server/exam-v2/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({
    questionId: z.string().uuid(),
});

const QuestionTypeSchema = z.enum([
    "SINGLE_CORRECT",
    "MULTI_CORRECT",
    "MATCHING_LIST",
    "NAT_INTEGER",
    "NAT_DECIMAL",
]);

const UpdateSchema = z.object({
    questionType: QuestionTypeSchema,
    questionText: z.string().trim().min(1),
    questionImageUrls: z.array(z.string().trim().min(1)).default([]),
    options: z.array(z.object({
        optionKey: z.string().trim().min(1).max(16),
        // Allow empty option text so admins can keep placeholders while editing.
        labelRich: z.string().trim(),
        imageUrls: z.array(z.string().trim().min(1)).default([]),
    })).default([]),
    correctAnswerText: z.string().trim().optional(),
    markingSchemeName: z.preprocess(
        (value) => {
            if (typeof value !== "string") return value;
            return value.trim() === "" ? undefined : value;
        },
        z.string().trim().min(1).optional(),
    ),
});

function parseCorrectAnswer(
    questionType: z.infer<typeof QuestionTypeSchema>,
    correctAnswerText: string | undefined,
): unknown {
    const raw = (correctAnswerText ?? "").trim();

    if (questionType === "MULTI_CORRECT") {
        return raw
            .split(/[\s,;|]+/g)
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean);
    }

    if (questionType === "SINGLE_CORRECT" || questionType === "MATCHING_LIST") {
        return raw.toUpperCase();
    }

    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
}

function toAssetsValue(urls: string[]): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
    const cleaned = urls.map((u) => u.trim()).filter(Boolean);
    if (!cleaned.length) return Prisma.JsonNull;
    return { imageUrls: cleaned };
}

function parseAssetsToUrls(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String).map((v) => v.trim()).filter(Boolean);
    if (typeof value === "string") {
        return value
            .split(/\r?\n|,|;/g)
            .map((s) => s.trim())
            .filter(Boolean);
    }
    if (value && typeof value === "object") {
        const obj = value as Record<string, unknown>;
        const candidates = [obj.imageUrls, obj.urls, obj.images, obj.url, obj.src];
        const out: string[] = [];
        for (const c of candidates) {
            if (typeof c === "string" && c.trim()) out.push(c.trim());
            if (Array.isArray(c)) {
                for (const i of c) {
                    const s = String(i).trim();
                    if (s) out.push(s);
                }
            }
        }
        return Array.from(new Set(out));
    }
    return [];
}

function toCorrectAnswerText(questionType: z.infer<typeof QuestionTypeSchema>, value: unknown): string {
    if (value == null) return "";
    if (questionType === "MULTI_CORRECT" && Array.isArray(value)) {
        return value.map(String).join(", ");
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

export async function GET(
    _req: Request,
    ctx: { params: Promise<{ questionId: string }> },
) {
    const gate = await ensureAdminGate();
    if (!gate.ok) return gate.res;

    const params = ParamsSchema.safeParse(await ctx.params);
    if (!params.success) return json({ error: "Invalid question id" }, { status: 400 });

    const question = await prisma.examV2Question.findUnique({
        where: { id: params.data.questionId },
        select: {
            id: true,
            questionType: true,
            stemRich: true,
            stemAssets: true,
            payload: true,
            marksScheme: { select: { name: true } },
            options: {
                orderBy: { sortOrder: "asc" },
                select: {
                    optionKey: true,
                    labelRich: true,
                    assets: true,
                },
            },
        },
    });

    if (!question) return json({ error: "Question not found" }, { status: 404 });

    const payloadObj = question.payload && typeof question.payload === "object" && !Array.isArray(question.payload)
        ? (question.payload as Record<string, unknown>)
        : null;

    const availableMarkingSchemes = await prisma.examV2MarkingScheme.findMany({
        where: { questionType: question.questionType },
        orderBy: { name: "asc" },
        select: { name: true },
    });

    const response = {
        questionType: question.questionType,
        questionText: question.stemRich,
        questionImageUrls: parseAssetsToUrls(question.stemAssets),
        markingSchemeName: question.marksScheme?.name ?? "",
        options: question.options.map((o) => ({
            optionKey: o.optionKey,
            labelRich: o.labelRich,
            imageUrls: parseAssetsToUrls(o.assets),
        })),
        correctAnswerText: toCorrectAnswerText(question.questionType, payloadObj?.correctAnswer),
        availableMarkingSchemes: availableMarkingSchemes.map((s) => s.name),
    };

    return json({ ok: true, question: response });
}

export async function PUT(
    req: Request,
    ctx: { params: Promise<{ questionId: string }> },
) {
    const gate = await ensureAdminGate();
    if (!gate.ok) return gate.res;

    const params = ParamsSchema.safeParse(await ctx.params);
    if (!params.success) return json({ error: "Invalid question id" }, { status: 400 });

    const body = UpdateSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
        return json({ error: "Invalid request", details: body.error.flatten() }, { status: 400 });
    }

    const existing = await prisma.examV2Question.findUnique({
        where: { id: params.data.questionId },
        select: {
            id: true,
            questionType: true,
            payload: true,
            marksScheme: { select: { id: true, name: true, questionType: true } },
            options: {
                select: { id: true, optionKey: true },
            },
        },
    });

    if (!existing) return json({ error: "Question not found" }, { status: 404 });

    if (existing.questionType !== body.data.questionType) {
        return json({ error: "Question type mismatch" }, { status: 400 });
    }

    const payloadBase = existing.payload && typeof existing.payload === "object" && !Array.isArray(existing.payload)
        ? { ...(existing.payload as Record<string, unknown>) }
        : {};

    let nextMarkingSchemeId: string | null = existing.marksScheme?.id ?? null;
    const requestedSchemeName = body.data.markingSchemeName?.trim();
    if (requestedSchemeName) {
        const scheme = await prisma.examV2MarkingScheme.findUnique({
            where: { name: requestedSchemeName },
            select: { id: true, questionType: true },
        });
        if (!scheme) {
            return json({ error: `Unknown marking scheme: ${requestedSchemeName}` }, { status: 400 });
        }
        if (scheme.questionType !== body.data.questionType) {
            return json({ error: "Marking scheme type does not match question type" }, { status: 400 });
        }
        nextMarkingSchemeId = scheme.id;
    }

    const parsedCorrect = parseCorrectAnswer(body.data.questionType, body.data.correctAnswerText);
    payloadBase.correctAnswer = parsedCorrect;

    const optionByKey = new Map(existing.options.map((o) => [o.optionKey, o] as const));

    const updateResult = await prisma.$transaction(async (tx) => {
        await tx.examV2Question.update({
            where: { id: existing.id },
            data: {
                stemRich: body.data.questionText,
                stemAssets: toAssetsValue(body.data.questionImageUrls),
                payload: payloadBase as Prisma.InputJsonValue,
                marksSchemeId: nextMarkingSchemeId,
            },
            select: { id: true },
        });

        const incomingKeys = new Set(body.data.options.map((o) => o.optionKey));
        const staleOptionIds = existing.options.filter((o) => !incomingKeys.has(o.optionKey)).map((o) => o.id);
        if (staleOptionIds.length) {
            await tx.examV2QuestionOption.deleteMany({ where: { id: { in: staleOptionIds } } });
        }

        for (const [idx, option] of body.data.options.entries()) {
            const isCorrect = (() => {
                if (body.data.questionType === "MULTI_CORRECT") {
                    return Array.isArray(parsedCorrect) ? parsedCorrect.map(String).includes(option.optionKey) : false;
                }
                if (body.data.questionType === "SINGLE_CORRECT" || body.data.questionType === "MATCHING_LIST") {
                    return String(parsedCorrect ?? "") === option.optionKey;
                }
                return null;
            })();

            const existingOption = optionByKey.get(option.optionKey);
            if (existingOption) {
                await tx.examV2QuestionOption.update({
                    where: { id: existingOption.id },
                    data: {
                        labelRich: option.labelRich,
                        assets: toAssetsValue(option.imageUrls),
                        sortOrder: idx,
                        isCorrect,
                    },
                    select: { id: true },
                });
            } else {
                await tx.examV2QuestionOption.create({
                    data: {
                        questionId: existing.id,
                        optionKey: option.optionKey,
                        labelRich: option.labelRich,
                        assets: toAssetsValue(option.imageUrls),
                        sortOrder: idx,
                        isCorrect,
                    },
                    select: { id: true },
                });
            }
        }

        return tx.examV2Question.findUnique({
            where: { id: existing.id },
            select: {
                id: true,
                questionType: true,
                stemRich: true,
                stemAssets: true,
                payload: true,
                marksScheme: { select: { name: true } },
                options: {
                    orderBy: { sortOrder: "asc" },
                    select: {
                        optionKey: true,
                        labelRich: true,
                        assets: true,
                        isCorrect: true,
                    },
                },
            },
        });
    });

    return json({ ok: true, question: updateResult });
}
