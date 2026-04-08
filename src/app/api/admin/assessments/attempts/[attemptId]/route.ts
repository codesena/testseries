import { z } from "zod";
import { getAuthUser } from "@/server/auth";
import { isAdminUsername } from "@/server/admin";
import {
    AssessmentAttemptError,
    deleteAssessmentAttempt,
} from "@/server/assessment/attempts";
import { json } from "@/server/json";

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

    try {
        const deleted = await deleteAssessmentAttempt(params.data.attemptId);
        return json({
            ok: true,
            deleted,
        });
    } catch (error) {
        if (error instanceof AssessmentAttemptError) {
            return json({ error: error.message }, { status: error.status });
        }

        throw error;
    }
}
