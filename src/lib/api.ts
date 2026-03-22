export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(path, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
        cache: "no-store",
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText} ${text}`);
    }
    return (await res.json()) as T;
}

export async function apiPost<T>(
    path: string,
    body?: unknown,
    init?: RequestInit,
): Promise<T> {
    const res = await fetch(path, {
        method: "POST",
        body: body === undefined ? undefined : JSON.stringify(body),
        ...init,
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText} ${text}`);
    }
    return (await res.json()) as T;
}
