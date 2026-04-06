import { getAuthUser } from "@/server/auth";
import { isAdminUsername } from "@/server/admin";
import { prisma } from "@/server/db";
import { json } from "@/server/json";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ attemptId: z.string().uuid() });

export async function DELETE(
    _req: Request,
    ctx: { params: Promise<{ attemptId: string }> },
) {
    const auth = await getAuthUser();
    if (!auth) {
        return json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isAdminUsername(auth.username)) {
        return json({ error: "Forbidden" }, { status: 403 });
    }

    const params = ParamsSchema.safeParse(await ctx.params);
    if (!params.success) {
        return json({ error: "Invalid attempt id" }, { status: 400 });
    }

    const existing = await prisma.examV2Attempt.findUnique({
        where: { id: params.data.attemptId },
        select: { id: true, userId: true, examId: true, status: true, totalScore: true },
    });

    if (!existing) {
        return json({ error: "Attempt not found" }, { status: 404 });
    }

    await prisma.examV2Attempt.delete({
        where: { id: params.data.attemptId },
    });

    return json({
        ok: true,
        deleted: {
            id: existing.id,
            userId: existing.userId,
            examId: existing.examId,
            status: existing.status,
            totalScore: existing.totalScore,
        },
    });
}
