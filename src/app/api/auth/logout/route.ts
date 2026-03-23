import { clearAuthCookie } from "@/server/auth";
import { json } from "@/server/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
    await clearAuthCookie();
    return json({ ok: true });
}
