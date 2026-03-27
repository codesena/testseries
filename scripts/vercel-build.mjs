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

async function main() {
    const prisma = getBin("prisma");
    const next = getBin("next");

    const maxRetries = Number(process.env.PRISMA_MIGRATE_DEPLOY_RETRIES ?? "12");
    const baseDelayMs = Number(process.env.PRISMA_MIGRATE_DEPLOY_RETRY_DELAY_MS ?? "5000");

    for (let attempt = 0; ; attempt++) {
        const res = await run(prisma, ["migrate", "deploy"]);
        if (res.code === 0) break;

        const combined = `${res.stdout}\n${res.stderr}`;
        const shouldRetry = isAdvisoryLockTimeout(combined) && attempt < maxRetries;
        if (!shouldRetry) {
            process.exit(res.code);
        }

        const backoffMs = Math.min(60000, baseDelayMs * Math.max(1, attempt + 1));
        console.log(
            `\n[vercel-build] prisma migrate deploy: advisory lock busy. ` +
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
