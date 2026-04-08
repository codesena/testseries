import { getAuthUserId } from "@/server/auth";
import { json } from "@/server/json";
import {
    AssessmentAttemptError,
    createLegacyAssessmentAttempt,
} from "@/server/assessment/attempts";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateAttemptSchema = z.object({
    testId: z.string().uuid(),
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

    try {
        const created = await createLegacyAssessmentAttempt(userId, parsed.data.testId);
        return json({
            attemptId: created.attemptId,
            attemptPath: created.attemptPath,
            reportPath: created.reportPath,
            variant: created.variant,
        });
    } catch (error) {
        if (error instanceof AssessmentAttemptError) {
            return json({ error: error.message }, { status: error.status });
        }

        throw error;
    }
}
