import { NextResponse } from "next/server";

function isDate(value: unknown): value is Date {
    return value instanceof Date;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (value == null || typeof value !== "object") return false;
    if (Array.isArray(value)) return false;
    if (isDate(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

export function toJsonSafe(value: unknown): unknown {
    if (typeof value === "bigint") return value.toString();
    if (Array.isArray(value)) return value.map(toJsonSafe);
    if (isDate(value)) return value;

    if (isPlainObject(value)) {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = toJsonSafe(v);
        }
        return out;
    }

    return value;
}

export function json(data: unknown, init?: ResponseInit) {
    return NextResponse.json(toJsonSafe(data), init);
}
