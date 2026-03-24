import "dotenv/config";

function requireEnv(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`${name} is required`);
    return v;
}

async function main() {
    const prodUrl = process.env.DATABASE_URL_PROD || process.env.PROD_DATABASE_URL;
    if (!prodUrl) {
        throw new Error(
            "Missing DATABASE_URL_PROD (or PROD_DATABASE_URL) in .env.\n" +
            "Keep DATABASE_URL for local dev, and set DATABASE_URL_PROD for production seeding.",
        );
    }

    const confirm = process.env.CONFIRM_PROD_SEED;
    if (confirm !== "yes") {
        throw new Error(
            "Refusing to seed production without explicit confirmation.\n" +
            "Set CONFIRM_PROD_SEED=yes and re-run.",
        );
    }

    // Ensure Prisma uses prod DB for this process.
    process.env.DATABASE_URL = prodUrl;

    // This will run the existing Notion importer (which reads NOTION_* env vars)
    // against the production database.
    await import("./seed-notion");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
