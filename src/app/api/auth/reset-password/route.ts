import { prisma } from "@/server/db";
import { hashPassword } from "@/server/auth";
import { json } from "@/server/json";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ResetSchema = z.object({
    username: z.string().trim().min(1),
    newPassword: z.string().min(4).max(50),
});

export async function POST(req: Request) {
    const parsed = ResetSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return json(
            { error: "Invalid request", details: parsed.error.flatten() },
            { status: 400 },
        );
    }

    const { username, newPassword } = parsed.data;

    const user = await prisma.user.findUnique({
        where: { username },
        select: { id: true },
    });

    if (!user) {
        return json({ error: "User not found" }, { status: 404 });
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
        select: { id: true },
    });

    return json({ ok: true });
}
