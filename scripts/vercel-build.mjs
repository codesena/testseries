import { spawn } from "node:child_process";

function getBin(name) {
    const suffix = process.platform === "win32" ? ".cmd" : "";
    return new URL(`../node_modules/.bin/${name}${suffix}`, import.meta.url).pathname;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run(cmd, args) {
    return await new Promise((resolve) => {
        const child = spawn(cmd, args, {
            stdio: ["inherit", "pipe", "pipe"],
            env: process.env,
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk) => {
            const s = chunk.toString();
            stdout += s;
            process.stdout.write(chunk);
        });

        child.stderr.on("data", (chunk) => {
            const s = chunk.toString();
            stderr += s;
            process.stderr.write(chunk);
        });

        child.on("close", (code) => {
            resolve({ code: code ?? 1, stdout, stderr });
        });
    });
}

function isAdvisoryLockTimeout(output) {
    return (
        /pg_advisory_lock/i.test(output) ||
        /migrate-advisory-locking/i.test(output) ||
        /advisory lock/i.test(output)
    );
}

function isTransientDbError(output) {
    return (
        /\bP1001\b/i.test(output) ||
        /\bP1017\b/i.test(output) ||
        /Can't reach database server/i.test(output) ||
        /server has closed the connection/i.test(output) ||
        /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH/i.test(output) ||
        /Connection terminated unexpectedly/i.test(output)
    );
}

function looksLikePooledPostgresUrl(value) {
    if (typeof value !== "string") return false;

    try {
        const url = new URL(value);
        return (
            url.port === "6432" ||
            /-pooler\./i.test(url.hostname) ||
            ["true", "1"].includes(url.searchParams.get("pgbouncer")?.toLowerCase() ?? "")
        );
    } catch {
        return /(?:^|[?&])port=6432(?:&|$)/i.test(value) || /-pooler\./i.test(value);
    }
}

async function main() {
    const prisma = getBin("prisma");
    const next = getBin("next");
    const hasDirectUrl = Boolean(process.env.DIRECT_URL || process.env.DIRECT_DATABASE_URL);
    const runtimeDatabaseUrl = process.env.DATABASE_URL;

    const maxRetries = Number(process.env.PRISMA_MIGRATE_DEPLOY_RETRIES ?? "12");
    const baseDelayMs = Number(process.env.PRISMA_MIGRATE_DEPLOY_RETRY_DELAY_MS ?? "5000");

    for (let attempt = 0; ; attempt++) {
        const res = await run(prisma, ["migrate", "deploy"]);
        if (res.code === 0) break;

        const combined = `${res.stdout}\n${res.stderr}`;
        const lockBusy = isAdvisoryLockTimeout(combined);
        const transientDb = isTransientDbError(combined);
        const shouldRetry = (lockBusy || transientDb) && attempt < maxRetries;
        if (!shouldRetry) {
            if (!hasDirectUrl && looksLikePooledPostgresUrl(runtimeDatabaseUrl)) {
                console.error(
                    "\n[vercel-build] Prisma is running migrations against DATABASE_URL, " +
                    "and it looks like a pooled PostgreSQL connection string. " +
                    "Set DIRECT_URL (or DIRECT_DATABASE_URL) in Vercel to the direct database endpoint " +
                    "for prisma migrate deploy, while keeping DATABASE_URL for runtime traffic. " +
                    "For Azure Database for PostgreSQL Flexible Server, use port 5432 for the direct endpoint.\n",
                );
            }
            process.exit(res.code);
        }

        const backoffMs = Math.min(60000, baseDelayMs * Math.max(1, attempt + 1));
        const reason = lockBusy
            ? "advisory lock busy"
            : "transient database connection issue";
        console.log(
            `\n[vercel-build] prisma migrate deploy: ${reason}. ` +
            `Retrying in ${Math.round(backoffMs / 1000)}s (${attempt + 1}/${maxRetries})...\n`,
        );
        await sleep(backoffMs);
    }

    const build = await run(next, ["build"]);
    process.exit(build.code);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
