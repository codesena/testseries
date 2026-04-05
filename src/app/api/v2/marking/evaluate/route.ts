import { getAuthUserId } from "@/server/auth";
import { prisma } from "@/server/db";
import { json } from "@/server/json";
import { evaluateWithDynamicScheme } from "@/server/exam-v2/evaluate";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
    schemeName: z.string().trim().min(1),
    questionType: z.enum([
        "SINGLE_CORRECT",
        "MULTI_CORRECT",
        "MATCHING_LIST",
        "NAT_INTEGER",
        "NAT_DECIMAL",
    ]),
    userAnswer: z.unknown().optional(),
    correctAnswer: z.unknown().optional(),
});

export async function POST(req: Request) {
    const userId = await getAuthUserId();
    if (!userId) {
        return json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return json(
            { error: "Invalid request", details: parsed.error.flatten() },
            { status: 400 },
        );
    }

    const scheme = await prisma.examV2MarkingScheme.findUnique({
        where: { name: parsed.data.schemeName },
        select: {
            questionType: true,
            unattemptedScore: true,
            rules: {
                orderBy: { priority: "asc" },
                select: {
                    ruleKind: true,
                    priority: true,
                    score: true,
                    minCorrectSelected: true,
                    maxCorrectSelected: true,
                    minIncorrectSelected: true,
                    maxIncorrectSelected: true,
                    requireAllCorrect: true,
                    requireZeroIncorrect: true,
                    requireUnattempted: true,
                },
            },
        },
    });

    if (!scheme) {
        return json({ error: "Marking scheme not found" }, { status: 404 });
    }

    if (scheme.questionType !== parsed.data.questionType) {
        return json(
            {
                error: "Question type does not match scheme",
                expectedQuestionType: scheme.questionType,
            },
            { status: 400 },
        );
    }

    const marks = evaluateWithDynamicScheme({
        questionType: parsed.data.questionType,
        userAnswer: parsed.data.userAnswer,
        correctAnswer: parsed.data.correctAnswer,
        scheme: {
            questionType: scheme.questionType,
            unattemptedScore: scheme.unattemptedScore,
            rules: scheme.rules,
        },
    });

    return json({ marks });
}
