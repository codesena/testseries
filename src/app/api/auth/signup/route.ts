import { prisma } from "@/server/db";
import { hashPassword } from "@/server/auth";
import { json } from "@/server/json";
import { z } from "zod";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SignupSchema = z.object({
    name: z.string().min(1).max(100),
    username: z
        .string()
        .trim()
        .regex(/^\d{10,15}$/, "Username must be your mobile number (10-15 digits)"),
    password: z
        .string()
        .trim()
        .regex(/^\d{4}$/, "Password must be your birth year (YYYY)"),
});

export async function POST(req: Request) {
    const parsed = SignupSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return json(
            { error: "Invalid request", details: parsed.error.flatten() },
            { status: 400 },
        );
    }

    const { name, username, password } = parsed.data;

    const existing = await prisma.user.findUnique({
        where: { username },
        select: { id: true },
    });

    if (existing) {
        return json({ error: "Username already exists" }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);

    await prisma.user.create({
        data: {
            name,
            username,
            passwordHash,
        },
        select: { id: true },
    });

    return json({ ok: true });
}
