export function extractQuestionOrderFromPayload(payload: unknown): number | null {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const obj = payload as Record<string, unknown>;
    const raw = obj.qNo ?? obj.q_no ?? obj.qno ?? obj.order ?? obj.orderIndex;
    if (typeof raw === "number" && Number.isInteger(raw)) return raw;
    if (typeof raw === "string") {
        const parsed = Number.parseInt(raw.trim(), 10);
        return Number.isInteger(parsed) ? parsed : null;
    }
    return null;
}