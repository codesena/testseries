import { getAuthUserId } from "@/server/auth";
import { prisma } from "@/server/db";
import { json } from "@/server/json";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateAttemptSchema = z.object({
    examId: z.string().uuid(),
    clientOffsetMs: z.number().int().min(-86_400_000).max(86_400_000).optional(),
});

export async function POST(req: Request) {
    const userId = await getAuthUserId();
    if (!userId) {
        return json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = CreateAttemptSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return json(
            { error: "Invalid request", details: parsed.error.flatten() },
            { status: 400 },
        );
    }

    const exam = await prisma.examV2.findUnique({
        where: { id: parsed.data.examId },
        select: { id: true, durationMinutes: true, isActive: true },
    });
    if (!exam || !exam.isActive) {
        return json({ error: "Exam not found or inactive" }, { status: 404 });
    }

    const now = Date.now();
    const scheduledEndAt = new Date(now + exam.durationMinutes * 60 * 1000);

    const attempt = await prisma.examV2Attempt.create({
        data: {
            userId,
            examId: exam.id,
            scheduledEndAt,
            clientOffsetMs: parsed.data.clientOffsetMs ?? 0,
            lastHeartbeatAt: new Date(now),
        },
        select: {
            id: true,
            examId: true,
            status: true,
            startTimestamp: true,
            scheduledEndAt: true,
            clientOffsetMs: true,
        },
    });

    return json({ attempt }, { status: 201 });
}
