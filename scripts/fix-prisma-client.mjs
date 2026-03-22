import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const source = path.join(root, "node_modules", ".prisma");
const target = path.join(root, "node_modules", "@prisma", "client", ".prisma");

function exists(p) {
    try {
        fs.lstatSync(p);
        return true;
    } catch {
        return false;
    }
}

if (!exists(source)) {
    console.warn("[fix-prisma-client] Missing node_modules/.prisma; run prisma generate first.");
    process.exit(0);
}

if (exists(target)) {
    process.exit(0);
}

fs.mkdirSync(path.dirname(target), { recursive: true });

// Create a symlink so @prisma/client can require('.prisma/client/default')
const relative = path.relative(path.dirname(target), source);
fs.symlinkSync(relative, target, "dir");
console.log(`[fix-prisma-client] Linked ${target} -> ${relative}`);
