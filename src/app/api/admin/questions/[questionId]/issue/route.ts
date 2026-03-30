import { getAuthUserId, getAuthUser } from "@/server/auth";
import { isAdminUsername } from "@/server/admin";
import { prisma } from "@/server/db";
import { json } from "@/server/json";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({
    questionId: z.string().uuid(),
});

const BodySchema = z.object({
    issue: z.string().trim().min(2).max(120),
    details: z.string().trim().max(5000).optional(),
});

export async function POST(
    req: Request,
    ctx: { params: Promise<{ questionId: string }> },
) {
    const auth = await getAuthUser();
    const userId = await getAuthUserId();

    if (!auth || !userId) {
        return json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isAdminUsername(auth.username)) {
        return json({ error: "Forbidden" }, { status: 403 });
    }

    const params = ParamsSchema.safeParse(await ctx.params);
    if (!params.success) {
        return json({ error: "Invalid params" }, { status: 400 });
    }

    const body = BodySchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
        return json(
            { error: "Invalid request", details: body.error.flatten() },
            { status: 400 },
        );
    }

    const question = await prisma.question.findUnique({
        where: { id: params.data.questionId },
        select: { id: true },
    });
    if (!question) {
        return json({ error: "Question not found" }, { status: 404 });
    }

    const created = await (prisma as any).adminQuestionIssueReport.create({
        data: {
            questionId: params.data.questionId,
            userId,
            issue: body.data.issue,
            details: body.data.details ? body.data.details : null,
        },
        select: { id: true, createdAt: true },
    });

    return json({
        ok: true,
        report: { id: String(created.id), createdAt: created.createdAt },
    });
}
