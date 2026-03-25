export function getAdminUsernames(): string[] {
    const raw = process.env.ADMIN_USERNAMES ?? process.env.ADMIN_USERNAME;
    if (!raw) return [];

    return raw
        .split(/[\s,]+/g)
        .map((s) => s.trim())
        .filter(Boolean);
}

export function isAdminUsername(username: string | null | undefined): boolean {
    if (!username) return false;
    const admins = getAdminUsernames();
    if (admins.length === 0) return false;
    return admins.includes(username);
}
