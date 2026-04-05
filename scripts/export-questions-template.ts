import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "../src/server/db";

type Json = Prisma.JsonValue;

type FlatQuestionRow = {
    testTitle: string;
    durationMinutes: number;
    advanced: boolean;
    order: number;
    subject: string;
    topic: string;
    type: "MCQ" | "Numerical";
    markingScheme: string;
    question: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    optionAImageUrl: string;
    optionBImageUrl: string;
    optionCImageUrl: string;
    optionDImageUrl: string;
    correctOption: string;
    correctOptions: string;
    correctInteger: string;
    questionUrls: string;
    difficulty: string;
};

function normalizeText(value: unknown): string {
    if (typeof value !== "string") return "";
    return value.trim();
}

function parseOptions(value: Json): Array<{ key: string; text: string }> {
    let parsed: unknown = value;

    if (typeof parsed === "string") {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            return [];
        }
    }

    if (Array.isArray(parsed)) {
        return parsed
            .filter((item): item is { key?: unknown; text?: unknown } => Boolean(item && typeof item === "object"))
            .map((item) => ({
                key: normalizeText(item.key).toUpperCase(),
                text: normalizeText(item.text),
            }))
            .filter((item) => Boolean(item.key));
    }

    if (parsed && typeof parsed === "object") {
        return Object.entries(parsed as Record<string, unknown>).map(([key, raw]) => {
            if (typeof raw === "string") {
                return { key: key.toUpperCase(), text: raw.trim() };
            }
            if (raw && typeof raw === "object") {
                return {
                    key: key.toUpperCase(),
                    text: normalizeText((raw as { text?: unknown }).text),
                };
            }
            return { key: key.toUpperCase(), text: "" };
        });
    }

    return [];
}

function asStringArray(value: Json): string[] {
    if (!Array.isArray(value)) return [];
    return value.map(String).map((v) => v.trim()).filter(Boolean);
}

function toCsv(rows: FlatQuestionRow[]): string {
    const headers = [
        "Test Title",
        "Duration Minutes",
        "Advanced",
        "Order",
        "Subject",
        "Topic",
        "Type",
        "Marking Scheme",
        "Question",
        "Option A",
        "Option B",
        "Option C",
        "Option D",
        "Option A Image URL",
        "Option B Image URL",
        "Option C Image URL",
        "Option D Image URL",
        "Correct Option",
        "Correct Options",
        "Correct Integer",
        "Question URLs",
        "Difficulty",
    ];

    const escape = (value: unknown) => {
        const text = String(value ?? "");
        return `"${text.replace(/"/g, '""')}"`;
    };

    const lines = rows.map((row) => [
        row.testTitle,
        row.durationMinutes,
        row.advanced,
        row.order,
        row.subject,
        row.topic,
        row.type,
        row.markingScheme,
        row.question,
        row.optionA,
        row.optionB,
        row.optionC,
        row.optionD,
        row.optionAImageUrl,
        row.optionBImageUrl,
        row.optionCImageUrl,
        row.optionDImageUrl,
        row.correctOption,
        row.correctOptions,
        row.correctInteger,
        row.questionUrls,
        row.difficulty,
    ].map(escape).join(","));

    return `${headers.map(escape).join(",")}\n${lines.join("\n")}\n`;
}

async function main() {
    const tests = await prisma.testSeries.findMany({
        orderBy: { createdAt: "asc" },
        select: {
            id: true,
            title: true,
            totalDurationMinutes: true,
            isAdvancedFormat: true,
            questions: {
                orderBy: { orderIndex: "asc" },
                select: {
                    orderIndex: true,
                    question: {
                        select: {
                            subject: { select: { name: true } },
                            topicName: true,
                            questionText: true,
                            options: true,
                            correctAnswer: true,
                            markingSchemeType: true,
                            difficultyRank: true,
                            imageUrls: true,
                        },
                    },
                },
            },
        },
    });

    const rows: FlatQuestionRow[] = [];

    for (const test of tests) {
        for (const tq of test.questions) {
            const q = tq.question;
            const options = parseOptions(q.options);
            const optionByKey = new Map(options.map((opt) => [opt.key, opt.text] as const));

            const scheme = q.markingSchemeType;
            const isNumerical = scheme === "MAINS_NUMERICAL" || scheme === "ADV_NAT";
            const isMulti = scheme === "ADV_MULTI_CORRECT";

            const correctOption = typeof q.correctAnswer === "string" ? q.correctAnswer.toUpperCase() : "";
            const correctOptions = isMulti ? asStringArray(q.correctAnswer).join(",") : "";
            const correctInteger = isNumerical ? String(q.correctAnswer ?? "") : "";

            rows.push({
                testTitle: test.title,
                durationMinutes: test.totalDurationMinutes,
                advanced: test.isAdvancedFormat,
                order: tq.orderIndex,
                subject: q.subject.name,
                topic: normalizeText(q.topicName),
                type: isNumerical ? "Numerical" : "MCQ",
                markingScheme: scheme,
                question: normalizeText(q.questionText),
                optionA: optionByKey.get("A") ?? "",
                optionB: optionByKey.get("B") ?? "",
                optionC: optionByKey.get("C") ?? "",
                optionD: optionByKey.get("D") ?? "",
                // Keep image URL fields empty as requested; you can add these later.
                optionAImageUrl: "",
                optionBImageUrl: "",
                optionCImageUrl: "",
                optionDImageUrl: "",
                correctOption: isMulti || isNumerical ? "" : correctOption,
                correctOptions,
                correctInteger,
                questionUrls: "",
                difficulty: q.difficultyRank == null ? "" : String(q.difficultyRank),
            });
        }
    }

    const outDir = join(process.cwd(), "docs");
    const jsonPath = join(outDir, "question-data-template.json");
    const csvPath = join(outDir, "question-data-template.csv");

    await writeFile(jsonPath, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
    await writeFile(csvPath, toCsv(rows), "utf8");

    console.log(`Exported ${rows.length} questions:`);
    console.log(`- ${jsonPath}`);
    console.log(`- ${csvPath}`);
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
