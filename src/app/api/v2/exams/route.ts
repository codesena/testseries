import { getAuthUserId } from "@/server/auth";
import { prisma } from "@/server/db";
import { json } from "@/server/json";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateExamV2Schema = z.object({
    code: z
        .string()
        .trim()
        .min(3)
        .max(64)
        .regex(/^[A-Za-z0-9_-]+$/),
    title: z.string().trim().min(3).max(256),
    durationMinutes: z.number().int().min(1).max(720),
    instructionsRichText: z.string().max(20000).optional(),
    isActive: z.boolean().optional(),
});

export async function GET() {
    const userId = await getAuthUserId();
    if (!userId) {
        return json({ error: "Unauthorized" }, { status: 401 });
    }

    const exams = await prisma.examV2.findMany({
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            code: true,
            title: true,
            durationMinutes: true,
            isActive: true,
            createdAt: true,
            _count: {
                select: {
                    subjects: true,
                    attempts: true,
                },
            },
        },
    });

    return json({ exams });
}

export async function POST(req: Request) {
    const userId = await getAuthUserId();
    if (!userId) {
        return json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = CreateExamV2Schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return json(
            {
                error: "Invalid request",
                details: parsed.error.flatten(),
            },
            { status: 400 },
        );
    }

    const existing = await prisma.examV2.findUnique({
        where: { code: parsed.data.code },
        select: { id: true },
    });
    if (existing) {
        return json({ error: "Exam code already exists" }, { status: 409 });
    }

    const created = await prisma.examV2.create({
        data: {
            code: parsed.data.code,
            title: parsed.data.title,
            durationMinutes: parsed.data.durationMinutes,
            instructionsRichText: parsed.data.instructionsRichText ?? null,
            isActive: parsed.data.isActive ?? true,
        },
        select: { id: true, code: true },
    });

    return json({ exam: created }, { status: 201 });
}
