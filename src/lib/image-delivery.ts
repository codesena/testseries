function hasToken(transform: string, token: string): boolean {
    return transform.split(",").some((part) => part.trim() === token);
}

/**
 * Adds Cloudinary auto-format/quality delivery flags when missing.
 * Non-Cloudinary URLs are returned unchanged.
 */
export function optimizeImageDelivery(url: string): string {
    const trimmed = url.trim();
    if (!trimmed) return trimmed;

    let parsed: URL;
    try {
        parsed = new URL(trimmed);
    } catch {
        return trimmed;
    }

    if (parsed.hostname !== "res.cloudinary.com") {
        return trimmed;
    }

    const marker = "/image/upload/";
    const path = parsed.pathname;
    const idx = path.indexOf(marker);
    if (idx < 0) return trimmed;

    const before = path.slice(0, idx + marker.length);
    const tail = path.slice(idx + marker.length);
    if (!tail) return trimmed;

    const slash = tail.indexOf("/");
    const firstSegment = slash >= 0 ? tail.slice(0, slash) : tail;
    const rest = slash >= 0 ? tail.slice(slash + 1) : "";

    const tokens = firstSegment.split(",").map((x) => x.trim()).filter(Boolean);
    const looksLikeTransform = tokens.some((token) => /^[a-z]{1,3}_/.test(token));

    if (looksLikeTransform) {
        if (!hasToken(firstSegment, "f_auto")) tokens.push("f_auto");
        if (!hasToken(firstSegment, "q_auto")) tokens.push("q_auto");

        parsed.pathname = `${before}${tokens.join(",")}${rest ? `/${rest}` : ""}`;
        return parsed.toString();
    }

    parsed.pathname = `${before}f_auto,q_auto/${tail}`;
    return parsed.toString();
}