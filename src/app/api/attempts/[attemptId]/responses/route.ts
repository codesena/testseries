import { prisma } from "@/server/db";
import { PaletteStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ attemptId: z.string().uuid() });

const UpsertResponseSchema = z.object({
    questionId: z.string().uuid(),
    selectedAnswer: z.any().nullable().optional(),
    paletteStatus: z.nativeEnum(PaletteStatus),
    timeDeltaSeconds: z.number().int().min(0).max(60 * 60).default(0),
    action: z
        .enum(["SAVE_NEXT", "MARK_REVIEW_NEXT", "CLEAR_RESPONSE", "NAVIGATE"])
        .default("NAVIGATE"),
});

export async function POST(
    req: Request,
    ctx: { params: Promise<{ attemptId: string }> },
) {
    const params = ParamsSchema.safeParse(await ctx.params);
    if (!params.success) {
        return NextResponse.json({ error: "Invalid attempt id" }, { status: 400 });
    }

    const body = UpsertResponseSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
        return NextResponse.json(
            { error: "Invalid request", details: body.error.flatten() },
            { status: 400 },
        );
    }

    const { attemptId } = params.data;
    const { questionId, selectedAnswer, paletteStatus, timeDeltaSeconds, action } =
        body.data;

    const response = await prisma.questionResponse.upsert({
        where: { attemptId_questionId: { attemptId, questionId } },
        update: {
            selectedAnswer: selectedAnswer === undefined ? undefined : selectedAnswer,
            paletteStatus,
            timeSpentSeconds: { increment: timeDeltaSeconds },
            lastUpdated: new Date(),
        },
        create: {
            attemptId,
            questionId,
            selectedAnswer: selectedAnswer === undefined ? null : selectedAnswer,
            paletteStatus,
            timeSpentSeconds: timeDeltaSeconds,
        },
        select: {
            questionId: true,
            selectedAnswer: true,
            paletteStatus: true,
            timeSpentSeconds: true,
            lastUpdated: true,
        },
    });

    await prisma.activityLog.create({
        data: {
            attemptId,
            questionId,
            type: action,
            payload: { paletteStatus, timeDeltaSeconds },
        },
    });

    return NextResponse.json({ response });
}
