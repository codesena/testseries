const IST_LOCALE = "en-IN";
const IST_TIME_ZONE = "Asia/Kolkata";

export function formatDateTimeIST(
    value: Date | string | null | undefined,
    options?: Intl.DateTimeFormatOptions,
): string {
    if (!value) return "—";

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : "—";

    return new Intl.DateTimeFormat(IST_LOCALE, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: IST_TIME_ZONE,
        ...options,
    }).format(date);
}
