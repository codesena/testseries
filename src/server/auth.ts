import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";

const AUTH_COOKIE_NAME = "auth_token";
const AUTH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getJwtSecretKey() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error("JWT_SECRET is not set");
    }
    return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string) {
    // bcryptjs is pure JS; 10 rounds is a reasonable default for this project.
    return await bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, passwordHash: string) {
    return await bcrypt.compare(password, passwordHash);
}

export async function signAuthToken(payload: { userId: string; username: string }) {
    const now = Math.floor(Date.now() / 1000);
    return await new SignJWT({ username: payload.username })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(payload.userId)
        .setIssuedAt(now)
        .setExpirationTime(now + AUTH_TTL_SECONDS)
        .sign(getJwtSecretKey());
}

export async function verifyAuthToken(token: string) {
    try {
        const { payload } = await jwtVerify(token, getJwtSecretKey());
        const userId = typeof payload.sub === "string" ? payload.sub : null;
        const username = typeof payload.username === "string" ? payload.username : null;
        if (!userId || !username) return null;
        return { userId, username };
    } catch {
        return null;
    }
}

export async function setAuthCookie(token: string) {
    const cookieStore = await cookies();
    cookieStore.set(AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: AUTH_TTL_SECONDS,
    });
}

export async function clearAuthCookie() {
    const cookieStore = await cookies();
    cookieStore.set(AUTH_COOKIE_NAME, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
    });
}

export async function getAuthUserId(): Promise<string | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
    if (!token) return null;

    const verified = await verifyAuthToken(token);
    return verified?.userId ?? null;
}
