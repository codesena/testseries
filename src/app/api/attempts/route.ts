import { prisma } from "@/server/db";
import { shuffled } from "@/server/utils/shuffle";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateAttemptSchema = z.object({
    testId: z.string().uuid(),
});

async function getOrCreateStudentId(): Promise<string> {
    const cookieStore = await cookies();
    const existing = cookieStore.get("student_id")?.value;
    if (existing && z.string().uuid().safeParse(existing).success) return existing;

    const newId = crypto.randomUUID();
    cookieStore.set("student_id", newId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
    });
    return newId;
}

export async function POST(req: Request) {
    const parsed = CreateAttemptSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid request", details: parsed.error.flatten() },
            { status: 400 },
        );
    }

    const studentId = await getOrCreateStudentId();

    const test = await prisma.testSeries.findUnique({
        where: { id: parsed.data.testId },
        select: {
            id: true,
            totalDurationMinutes: true,
            questions: {
                orderBy: { orderIndex: "asc" },
                select: { questionId: true },
            },
        },
    });

    if (!test) {
        return NextResponse.json({ error: "Test not found" }, { status: 404 });
    }

    const baseQuestionOrder = test.questions.map((q) => q.questionId);
    const questionOrder = shuffled(baseQuestionOrder);

    const questions = await prisma.question.findMany({
        where: { id: { in: questionOrder } },
        select: { id: true, options: true },
    });
    const byId = new Map(questions.map((q) => [q.id, q] as const));

    const optionOrders: Record<string, string[]> = {};
    for (const qid of questionOrder) {
        const q = byId.get(qid);
        const opt = (q?.options ?? {}) as Record<string, unknown>;
        optionOrders[qid] = shuffled(Object.keys(opt));
    }

    const attempt = await prisma.studentAttempt.create({
        data: {
            studentId,
            testId: test.id,
            status: "IN_PROGRESS",
            questionOrder,
            optionOrders,
        },
        select: { id: true },
    });

    await prisma.activityLog.create({
        data: {
            attemptId: attempt.id,
            type: "HEARTBEAT",
            payload: { created: true },
        },
    });

    return NextResponse.json({ attemptId: attempt.id });
}
