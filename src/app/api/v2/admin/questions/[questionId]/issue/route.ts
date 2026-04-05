import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { json } from "@/server/json";
import { ensureAdminGate } from "@/server/exam-v2/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({
    questionId: z.string().uuid(),
});

const BodySchema = z.object({
    issue: z.string().trim().min(2).max(120),
    details: z.string().trim().max(5000).optional(),
});

type StoredAdminIssue = {
    id: string;
    source: "admin";
    createdAt: string;
    issue: string;
    details: string | null;
    attemptId: string | null;
    reporterName: string | null;
    reporterUsername: string | null;
};

function parseStoredIssues(payload: unknown): StoredAdminIssue[] {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
    const raw = (payload as Record<string, unknown>).adminIssues;
    if (!Array.isArray(raw)) return [];

    const out: StoredAdminIssue[] = [];
    for (const item of raw) {
        if (!item || typeof item !== "object") continue;
        const row = item as Record<string, unknown>;
        const id = String(row.id ?? "").trim();
        const createdAt = String(row.createdAt ?? "").trim();
        const issue = String(row.issue ?? "").trim();
        if (!id || !createdAt || !issue) continue;

        out.push({
            id,
            source: "admin",
            createdAt,
            issue,
            details: row.details == null ? null : String(row.details),
            attemptId: null,
            reporterName: row.reporterName == null ? null : String(row.reporterName),
            reporterUsername: row.reporterUsername == null ? null : String(row.reporterUsername),
        });
    }

    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function withStoredIssues(payload: unknown, nextIssues: StoredAdminIssue[]): Prisma.InputJsonValue {
    const base = payload && typeof payload === "object" && !Array.isArray(payload)
        ? { ...(payload as Record<string, unknown>) }
        : {};

    base.adminIssues = nextIssues;
    return base as Prisma.InputJsonValue;
}

export async function GET(
    _req: Request,
    ctx: { params: Promise<{ questionId: string }> },
) {
    const gate = await ensureAdminGate();
    if (!gate.ok) return gate.res;

    const params = ParamsSchema.safeParse(await ctx.params);
    if (!params.success) return json({ error: "Invalid params" }, { status: 400 });

    const question = await prisma.examV2Question.findUnique({
        where: { id: params.data.questionId },
        select: { id: true, payload: true },
    });

    if (!question) return json({ error: "Question not found" }, { status: 404 });

    const reports = parseStoredIssues(question.payload);
    return json({ ok: true, reports });
}

export async function POST(
    req: Request,
    ctx: { params: Promise<{ questionId: string }> },
) {
    const gate = await ensureAdminGate();
    if (!gate.ok) return gate.res;

    const params = ParamsSchema.safeParse(await ctx.params);
    if (!params.success) return json({ error: "Invalid params" }, { status: 400 });

    const body = BodySchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
        return json(
            { error: "Invalid request", details: body.error.flatten() },
            { status: 400 },
        );
    }

    const existing = await prisma.examV2Question.findUnique({
        where: { id: params.data.questionId },
        select: { id: true, payload: true },
    });

    if (!existing) return json({ error: "Question not found" }, { status: 404 });

    const nowIso = new Date().toISOString();
    const report: StoredAdminIssue = {
        id: `admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        source: "admin",
        createdAt: nowIso,
        issue: body.data.issue,
        details: body.data.details ? body.data.details : null,
        attemptId: null,
        reporterName: null,
        reporterUsername: gate.auth.username,
    };

    const previous = parseStoredIssues(existing.payload);
    const nextIssues = [report, ...previous];

    await prisma.examV2Question.update({
        where: { id: existing.id },
        data: {
            payload: withStoredIssues(existing.payload, nextIssues),
        },
        select: { id: true },
    });

    return json({ ok: true, report });
}
