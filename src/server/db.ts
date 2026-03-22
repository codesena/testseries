import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error("DATABASE_URL is required to initialize PrismaClient");
    }

    const adapter = new PrismaPg({ connectionString });
    return new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
}

export const prisma = new Proxy({} as PrismaClient, {
    get(_target, prop) {
        if (!globalForPrisma.prisma) {
            globalForPrisma.prisma = createPrismaClient();
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (globalForPrisma.prisma as any)[prop];
    },
});
