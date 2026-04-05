import { getAuthUserId } from "@/server/auth";
import { prisma } from "@/server/db";
import { json } from "@/server/json";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({
    attemptId: z.string().uuid(),
});

const EventSchema = z.object({
    clientEventId: z.string().trim().min(1).max(128),
    eventType: z.string().trim().min(1).max(64),
    questionId: z.string().uuid().optional(),
    payload: z.any().optional(),
});

export async function POST(
    req: Request,
    ctx: { params: Promise<{ attemptId: string }> },
) {
    const userId = await getAuthUserId();
    if (!userId) {
        return json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = ParamsSchema.safeParse(await ctx.params);
    if (!params.success) {
        return json({ error: "Invalid attempt id" }, { status: 400 });
    }

    const body = EventSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
        return json(
            { error: "Invalid request", details: body.error.flatten() },
            { status: 400 },
        );
    }

    const attempt = await prisma.examV2Attempt.findFirst({
        where: {
            id: params.data.attemptId,
            userId,
        },
        select: {
            id: true,
            status: true,
            scheduledEndAt: true,
        },
    });
    if (!attempt) {
        return json({ error: "Attempt not found" }, { status: 404 });
    }

    if (attempt.status !== "IN_PROGRESS") {
        return json({ error: "Attempt already submitted" }, { status: 409 });
    }

    if (new Date() > attempt.scheduledEndAt) {
        const submitted = await prisma.examV2Attempt.update({
            where: { id: attempt.id },
            data: {
                status: "AUTO_SUBMITTED",
                submittedAt: new Date(),
            },
            select: { id: true },
        });
        return json(
            {
                error: "Attempt expired",
                attemptId: submitted.id,
                status: "AUTO_SUBMITTED",
            },
            { status: 409 },
        );
    }

    const created = await prisma.examV2AttemptEvent.upsert({
        where: {
            attemptId_clientEventId: {
                attemptId: attempt.id,
                clientEventId: body.data.clientEventId,
            },
        },
        update: {
            payload: body.data.payload,
        },
        create: {
            attemptId: attempt.id,
            clientEventId: body.data.clientEventId,
            questionId: body.data.questionId,
            eventType: body.data.eventType,
            payload: body.data.payload,
        },
        select: {
            id: true,
            createdAt: true,
            clientEventId: true,
        },
    });

    await prisma.examV2Attempt.update({
        where: { id: attempt.id },
        data: {
            lastHeartbeatAt: body.data.eventType === "HEARTBEAT" ? new Date() : undefined,
        },
        select: { id: true },
    });

    return json({
        ok: true,
        event: {
            id: String(created.id),
            clientEventId: created.clientEventId,
            createdAt: created.createdAt,
        },
    });
}
