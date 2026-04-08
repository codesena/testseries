import { z } from "zod";
import { type AssessmentVariant } from "@/lib/assessment";
import { getAuthUserId } from "@/server/auth";
import {
    AssessmentAttemptError,
    createAssessmentAttempt,
} from "@/server/assessment/attempts";
import { json } from "@/server/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateAssessmentAttemptSchema = z.object({
    variant: z.enum(["main", "advancedLegacy", "advancedV2"] satisfies [AssessmentVariant, ...AssessmentVariant[]]),
    assessmentId: z.string().uuid(),
    clientOffsetMs: z.number().int().min(-86_400_000).max(86_400_000).optional(),
});

export async function POST(req: Request) {
    const userId = await getAuthUserId();
    if (!userId) {
        return json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = CreateAssessmentAttemptSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return json(
            { error: "Invalid request", details: parsed.error.flatten() },
            { status: 400 },
        );
    }

    try {
        const created = await createAssessmentAttempt({
            userId,
            variant: parsed.data.variant,
            assessmentId: parsed.data.assessmentId,
            clientOffsetMs: parsed.data.clientOffsetMs,
        });

        return json(created, { status: 201 });
    } catch (error) {
        if (error instanceof AssessmentAttemptError) {
            return json({ error: error.message }, { status: error.status });
        }

        throw error;
    }
}
