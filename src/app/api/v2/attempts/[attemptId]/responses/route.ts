import { getAuthUserId } from "@/server/auth";
import { prisma } from "@/server/db";
import { json } from "@/server/json";
import { Prisma } from "@prisma/client";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({
    attemptId: z.string().uuid(),
});

const BodySchema = z.object({
    questionId: z.string().uuid(),
    responseJson: z.unknown().optional(),
    numericValue: z.number().finite().optional(),
    answerState: z.enum([
        "NOT_VISITED",
        "VISITED_NOT_ANSWERED",
        "ANSWERED_SAVED",
        "MARKED_FOR_REVIEW",
        "ANSWERED_MARKED_FOR_REVIEW",
    ]),
    timeSpentSeconds: z.number().int().min(0).max(86_400).optional(),
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

    const body = BodySchema.safeParse(await req.json().catch(() => null));
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
            exam: {
                select: {
                    subjects: {
                        select: {
                            sections: {
                                select: {
                                    blocks: {
                                        select: {
                                            questions: { select: { id: true } },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!attempt) {
        return json({ error: "Attempt not found" }, { status: 404 });
    }

    if (attempt.status !== "IN_PROGRESS") {
        return json({ error: "Attempt already submitted" }, { status: 409 });
    }

    if (new Date() > attempt.scheduledEndAt) {
        await prisma.examV2Attempt.update({
            where: { id: attempt.id },
            data: {
                status: "AUTO_SUBMITTED",
                submittedAt: new Date(),
            },
            select: { id: true },
        });
        return json({ error: "Attempt expired" }, { status: 409 });
    }

    const questionSet = new Set(
        attempt.exam.subjects.flatMap((s) =>
            s.sections.flatMap((sec) => sec.blocks.flatMap((b) => b.questions.map((q) => q.id))),
        ),
    );

    if (!questionSet.has(body.data.questionId)) {
        return json({ error: "Question does not belong to this attempt" }, { status: 400 });
    }

    const upserted = await prisma.examV2Response.upsert({
        where: {
            attemptId_questionId: {
                attemptId: attempt.id,
                questionId: body.data.questionId,
            },
        },
        update: {
            responseJson: body.data.responseJson ?? Prisma.JsonNull,
            numericValue: body.data.numericValue,
            answerState: body.data.answerState,
            timeSpentSeconds: body.data.timeSpentSeconds,
            lastUpdated: new Date(),
        },
        create: {
            attemptId: attempt.id,
            questionId: body.data.questionId,
            responseJson: body.data.responseJson ?? Prisma.JsonNull,
            numericValue: body.data.numericValue,
            answerState: body.data.answerState,
            timeSpentSeconds: body.data.timeSpentSeconds ?? 0,
            lastUpdated: new Date(),
        },
        select: {
            attemptId: true,
            questionId: true,
            answerState: true,
            timeSpentSeconds: true,
            lastUpdated: true,
        },
    });

    return json({ response: upserted });
}
