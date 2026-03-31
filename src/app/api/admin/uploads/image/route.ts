import { createHash } from "node:crypto";
import { getAuthUser } from "@/server/auth";
import { isAdminUsername } from "@/server/admin";
import { json } from "@/server/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ROOT_FOLDER = "testseries";

function sanitizeFolderName(input: string): string {
    return input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-_\s]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80);
}

export async function POST(req: Request) {
    const auth = await getAuthUser();
    if (!auth) return json({ error: "Unauthorized" }, { status: 401 });
    if (!isAdminUsername(auth.username)) return json({ error: "Forbidden" }, { status: 403 });

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
        return json(
            {
                error: "Image upload is not configured",
                details: "Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET",
            },
            { status: 500 },
        );
    }

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    const rawFolderName = typeof form?.get("folderName") === "string" ? String(form?.get("folderName")) : "";
    const folderName = sanitizeFolderName(rawFolderName || "uploads");
    const folder = `${ROOT_FOLDER}/${folderName}`;

    if (!(file instanceof File)) {
        return json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
        return json({ error: "Only image files are allowed" }, { status: 400 });
    }

    if (file.size > MAX_FILE_BYTES) {
        return json({ error: "File too large (max 10MB)" }, { status: 400 });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const toSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = createHash("sha1").update(toSign).digest("hex");

    const cloudinaryForm = new FormData();
    cloudinaryForm.append("file", file);
    cloudinaryForm.append("api_key", apiKey);
    cloudinaryForm.append("timestamp", String(timestamp));
    cloudinaryForm.append("signature", signature);
    cloudinaryForm.append("folder", folder);

    const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: "POST",
        body: cloudinaryForm,
    });

    if (!uploadRes.ok) {
        const text = await uploadRes.text().catch(() => "");
        return json({ error: "Upload failed", details: text || uploadRes.statusText }, { status: 502 });
    }

    const data = await uploadRes.json() as { secure_url?: string; public_id?: string };
    if (!data.secure_url) {
        return json({ error: "Upload failed", details: "Missing secure URL from provider" }, { status: 502 });
    }

    return json({ ok: true, url: data.secure_url, publicId: data.public_id ?? null });
}
