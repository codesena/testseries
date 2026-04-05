import "dotenv/config";
import { spawnSync } from "node:child_process";

function getEnv(name: string): string {
    const v = process.env[name]?.trim();
    if (!v) throw new Error(`${name} is required`);
    return v;
}

function normalizeYes(value: string | undefined): boolean {
    const v = String(value ?? "").trim().toLowerCase();
    return v === "yes" || v === "y" || v === "true" || v === "1";
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
    const res = spawnSync(command, args, {
        stdio: "inherit",
        env,
    });

    if (res.status !== 0) {
        throw new Error(`Command failed: ${command} ${args.join(" ")}`);
    }
}

async function main() {
    const prodUrl = process.env.DATABASE_URL_PROD || process.env.PROD_DATABASE_URL;
    if (!prodUrl) {
        throw new Error(
            "Missing DATABASE_URL_PROD (or PROD_DATABASE_URL).",
        );
    }

    if (!normalizeYes(process.env.CONFIRM_PROD_SEED)) {
        throw new Error(
            "Refusing to seed production without explicit confirmation. Set CONFIRM_PROD_SEED=yes and re-run.",
        );
    }

    const paperIdsCsv = getEnv("ADV_NOTION_DATABASE_IDS");
    const paperIds = paperIdsCsv
        .split(/[\s,]+/g)
        .map((s) => s.trim())
        .filter(Boolean);

    if (paperIds.length === 0) {
        throw new Error("ADV_NOTION_DATABASE_IDS must contain at least one Notion database id.");
    }

    const baseEnv: NodeJS.ProcessEnv = {
        ...process.env,
        DATABASE_URL: prodUrl,
    };

    console.log("[prod-seed] Ensuring base seed (marking schemes/subjects) on production DB...");
    run("npx", ["prisma", "db", "seed"], baseEnv);

    for (const dbId of paperIds) {
        console.log(`[prod-seed] Seeding Advanced papers from Notion DB: ${dbId}`);
        run("npx", ["tsx", "scripts/seed-v2-paper1-paper2.ts"], {
            ...baseEnv,
            NOTION_DATABASE_ID: dbId,
        });
    }

    console.log("[prod-seed] Completed production seeding for Advanced paper set.");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
