import { prisma } from "@/server/db";
import { json } from "@/server/json";
import {
    ensureAdminGate,
    ExamV2UpsertSchema,
    upsertExamV2Graph,
} from "@/server/exam-v2/admin";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ListQuerySchema = z.object({
    q: z.string().trim().max(128).optional(),
    isActive: z
        .enum(["true", "false"])
        .transform((v) => v === "true")
        .optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(req: Request) {
    const gate = await ensureAdminGate();
    if (!gate.ok) return gate.res;

    const url = new URL(req.url);
    const query = ListQuerySchema.safeParse({
        q: url.searchParams.get("q") ?? undefined,
        isActive: url.searchParams.get("isActive") ?? undefined,
        page: url.searchParams.get("page") ?? undefined,
        pageSize: url.searchParams.get("pageSize") ?? undefined,
    });
    if (!query.success) {
        return json({ error: "Invalid query", details: query.error.flatten() }, { status: 400 });
    }

    const { q, isActive, page, pageSize } = query.data;
    const where = {
        ...(typeof isActive === "boolean" ? { isActive } : {}),
        ...(q
            ? {
                OR: [
                    { code: { contains: q, mode: "insensitive" as const } },
                    { title: { contains: q, mode: "insensitive" as const } },
                ],
            }
            : {}),
    };

    const [exams, total] = await prisma.$transaction([
        prisma.examV2.findMany({
            where,
            skip: (page - 1) * pageSize,
            take: pageSize,
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
        }),
        prisma.examV2.count({ where }),
    ]);

    return json({
        exams,
        pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
        filters: {
            q: q ?? "",
            isActive: typeof isActive === "boolean" ? isActive : null,
        },
    });
}

export async function POST(req: Request) {
    const gate = await ensureAdminGate();
    if (!gate.ok) return gate.res;

    const body = ExamV2UpsertSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
        return json({ error: "Invalid request", details: body.error.flatten() }, { status: 400 });
    }

    const existing = await prisma.examV2.findUnique({
        where: { code: body.data.code },
        select: { id: true },
    });
    if (existing) {
        return json({ error: "Exam code already exists" }, { status: 409 });
    }

    try {
        const created = await prisma.$transaction((tx) => upsertExamV2Graph(tx, body.data));
        return json({ ok: true, examId: created.examId, questionCount: created.questionCount }, { status: 201 });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create exam";
        return json({ error: message }, { status: 400 });
    }
}
