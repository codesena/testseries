import "dotenv/config";
import { readFile } from "node:fs/promises";
import { prisma } from "../src/server/db";
import { MarkingSchemeType, Prisma } from "@prisma/client";

type ParsedQuestion = {
    number: number;
    subjectId: number;
    topicName: string;
    questionText: string;
    options: Record<string, string>;
    markingSchemeType: MarkingSchemeType;
    correctAnswer: unknown;
};

const INPUT_PATH = "docs/aits-paper2-raw.txt";
const TEST_TITLE = "DRAFT AITS 2025 FT-V Paper-2 (No Key)";
const DURATION_MINUTES = 180;

const SINGLE_CORRECT = new Set([1, 2, 3, 4, 18, 19, 20, 21, 35, 36, 37, 38]);
const MULTI_CORRECT = new Set([5, 6, 7, 22, 23, 24, 39, 40, 41]);

function subjectIdFromQuestionNumber(n: number): number {
    if (n >= 1 && n <= 17) return 1;
    if (n >= 18 && n <= 34) return 2;
    return 3;
}

function cleanText(s: string): string {
    return s
        .replace(/\u000c/g, " ")
        .replace(/[\t ]+/g, " ")
        .replace(/\s*\n\s*/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeSource(raw: string): string {
    return raw
        .replace(/===== PAGE \d+ =====/g, "\n")
        .replace(/For More Material Join: @JEEAdvanced_2025/g, "\n")
        .replace(/AITS-FT-V \(Paper-2\)-PCM-JEE\(Advanced\)\/2025/g, "\n")
        .replace(/FIITJEE Ltd\.[^\n]*\n/g, "\n")
        .replace(/website: www\.fiitjee\.com/g, "\n");
}

function splitQuestionBlocks(src: string): Array<{ number: number; body: string }> {
    const re = /(?:^|\n)\s*(\d{1,2})\.\s/g;
    const matches = [...src.matchAll(re)];
    const blocks: Array<{ number: number; body: string }> = [];

    for (let i = 0; i < matches.length; i += 1) {
        const m = matches[i];
        const next = matches[i + 1];
        const number = Number(m[1]);
        if (!Number.isFinite(number) || number < 1 || number > 51) continue;

        const start = (m.index ?? 0) + m[0].length;
        const end = next?.index ?? src.length;
        const body = src.slice(start, end).trim();
        blocks.push({ number, body });
    }

    const dedup = new Map<number, string>();
    for (const b of blocks) {
        if (!dedup.has(b.number)) dedup.set(b.number, b.body);
    }

    return Array.from(dedup.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([number, body]) => ({ number, body }));
}

function parseOptionsAndQuestion(body: string): { questionText: string; options: Record<string, string> } {
    const optionMatches = [...body.matchAll(/\(\s*([A-D])\s*\)\s*/g)];
    if (optionMatches.length === 0) {
        return { questionText: cleanText(body), options: {} };
    }

    const firstOptionStart = optionMatches[0].index ?? body.length;
    const questionText = cleanText(body.slice(0, firstOptionStart));
    const options: Record<string, string> = { A: "", B: "", C: "", D: "" };

    for (let i = 0; i < optionMatches.length; i += 1) {
        const curr = optionMatches[i];
        const next = optionMatches[i + 1];
        const key = curr[1].toUpperCase();
        const contentStart = (curr.index ?? 0) + curr[0].length;
        const contentEnd = next?.index ?? body.length;
        options[key] = cleanText(body.slice(contentStart, contentEnd));
    }

    return { questionText, options };
}

function toQuestion(block: { number: number; body: string }): ParsedQuestion {
    const { number, body } = block;
    const subjectId = subjectIdFromQuestionNumber(number);
    const { questionText, options } = parseOptionsAndQuestion(body);

    if (SINGLE_CORRECT.has(number)) {
        return {
            number,
            subjectId,
            topicName: "AITS FT-V Paper-2",
            questionText,
            options,
            markingSchemeType: "MAINS_SINGLE",
            // Placeholder key: update later using official answer key.
            correctAnswer: "A",
        };
    }

    if (MULTI_CORRECT.has(number)) {
        return {
            number,
            subjectId,
            topicName: "AITS FT-V Paper-2",
            questionText,
            options,
            markingSchemeType: "ADV_MULTI_CORRECT",
            // Placeholder key: update later using official answer key.
            correctAnswer: ["A"],
        };
    }

    return {
        number,
        subjectId,
        topicName: "AITS FT-V Paper-2",
        questionText,
        options: {},
        markingSchemeType: "ADV_NAT",
        // Placeholder key: update later using official answer key.
        correctAnswer: 0,
    };
}

async function main() {
    const raw = await readFile(INPUT_PATH, "utf8");
    const normalized = normalizeSource(raw);
    const blocks = splitQuestionBlocks(normalized);

    const selected = blocks.filter((b) => b.number >= 1 && b.number <= 51);
    if (selected.length !== 51) {
        throw new Error(`Expected 51 questions from source, found ${selected.length}`);
    }

    const parsed = selected.map(toQuestion);

    // Create canonical subject rows if missing.
    await prisma.subjectCategory.upsert({ where: { id: 1 }, update: { name: "Physics" }, create: { id: 1, name: "Physics" } });
    await prisma.subjectCategory.upsert({ where: { id: 2 }, update: { name: "Chemistry" }, create: { id: 2, name: "Chemistry" } });
    await prisma.subjectCategory.upsert({ where: { id: 3 }, update: { name: "Mathematics" }, create: { id: 3, name: "Mathematics" } });

    const existing = await prisma.testSeries.findFirst({ where: { title: TEST_TITLE }, select: { id: true } });
    if (existing) {
        await prisma.testSeries.delete({ where: { id: existing.id } });
    }

    const created = await prisma.testSeries.create({
        data: {
            title: TEST_TITLE,
            totalDurationMinutes: DURATION_MINUTES,
            isAdvancedFormat: true,
        },
        select: { id: true, title: true },
    });

    for (let i = 0; i < parsed.length; i += 1) {
        const q = parsed[i];
        const createdQuestion = await prisma.question.create({
            data: {
                subjectId: q.subjectId,
                topicName: q.topicName,
                questionText: q.questionText,
                imageUrls: Prisma.JsonNull,
                options: q.options,
                correctAnswer: q.correctAnswer as never,
                markingSchemeType: q.markingSchemeType,
                difficultyRank: null,
            },
            select: { id: true },
        });

        await prisma.testQuestion.create({
            data: {
                testId: created.id,
                questionId: createdQuestion.id,
                orderIndex: i,
            },
        });
    }

    console.log(`Created test: ${created.title}`);
    console.log(`Test ID: ${created.id}`);
    console.log(`Inserted questions: ${parsed.length}`);
    console.log("Note: correct answers are placeholders and must be updated with official key.");
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
