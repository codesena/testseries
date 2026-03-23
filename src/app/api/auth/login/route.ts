import { prisma } from "@/server/db";
import { json } from "@/server/json";
import { setAuthCookie, signAuthToken, verifyPassword } from "@/server/auth";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LoginSchema = z.object({
    username: z.string().trim().min(1),
    password: z.string().min(1),
});

export async function POST(req: Request) {
    const parsed = LoginSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return json(
            { error: "Invalid request", details: parsed.error.flatten() },
            { status: 400 },
        );
    }

    const { username, password } = parsed.data;

    const user = await prisma.user.findUnique({
        where: { username },
        select: { id: true, username: true, passwordHash: true },
    });

    if (!user) {
        return json({ error: "Invalid username or password" }, { status: 401 });
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
        return json({ error: "Invalid username or password" }, { status: 401 });
    }

    const token = await signAuthToken({ userId: user.id, username: user.username });
    await setAuthCookie(token);

    return json({ ok: true });
}
