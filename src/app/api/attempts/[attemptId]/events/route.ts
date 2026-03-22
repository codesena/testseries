import { prisma } from "@/server/db";
import { ActivityType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ attemptId: z.string().uuid() });

const EventSchema = z.object({
    type: z.nativeEnum(ActivityType),
    questionId: z.string().uuid().optional(),
    payload: z.any().optional(),
});

export async function POST(
    req: Request,
    ctx: { params: Promise<{ attemptId: string }> },
) {
    const params = ParamsSchema.safeParse(await ctx.params);
    if (!params.success) {
        return NextResponse.json({ error: "Invalid attempt id" }, { status: 400 });
    }

    const body = EventSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
        return NextResponse.json(
            { error: "Invalid request", details: body.error.flatten() },
            { status: 400 },
        );
    }

    const created = await prisma.activityLog.create({
        data: {
            attemptId: params.data.attemptId,
            questionId: body.data.questionId,
            type: body.data.type,
            payload: body.data.payload,
        },
        select: { id: true, createdAt: true },
    });

    return NextResponse.json({ ok: true, event: created });
}
