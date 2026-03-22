import { openDB, type DBSchema } from "idb";

type OutboxItem = {
    id?: number;
    attemptId: string;
    kind: "response" | "event" | "submit";
    payload: unknown;
    createdAt: string;
};

type AttemptSnapshot = {
    attemptId: string;
    activeQuestionId: string | null;
    paletteByQuestionId: Record<string, string>;
    answersByQuestionId: Record<string, unknown>;
    timeByQuestionId: Record<string, number>;
    updatedAt: string;
};

interface JEEExamDB extends DBSchema {
    outbox: {
        key: number;
        value: OutboxItem;
        indexes: { "by-attempt": string };
    };
    attemptSnapshots: {
        key: string;
        value: AttemptSnapshot;
    };
}

const DB_NAME = "jee-testseries";
const DB_VERSION = 1;

async function db() {
    return openDB<JEEExamDB>(DB_NAME, DB_VERSION, {
        upgrade(database) {
            const outbox = database.createObjectStore("outbox", {
                keyPath: "id",
                autoIncrement: true,
            });
            outbox.createIndex("by-attempt", "attemptId");

            database.createObjectStore("attemptSnapshots", {
                keyPath: "attemptId",
            });
        },
    });
}

export async function saveAttemptSnapshot(snapshot: AttemptSnapshot) {
    const database = await db();
    await database.put("attemptSnapshots", snapshot);
}

export async function loadAttemptSnapshot(attemptId: string) {
    const database = await db();
    return database.get("attemptSnapshots", attemptId);
}

export async function enqueueOutbox(item: Omit<OutboxItem, "createdAt">) {
    const database = await db();
    await database.add("outbox", {
        ...item,
        createdAt: new Date().toISOString(),
    });
}

export async function listOutbox(attemptId: string) {
    const database = await db();
    return database.getAllFromIndex("outbox", "by-attempt", attemptId);
}

export async function deleteOutboxItem(id: number) {
    const database = await db();
    await database.delete("outbox", id);
}
