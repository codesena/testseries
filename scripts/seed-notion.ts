import "dotenv/config";
import { Client } from "@notionhq/client";
import { prisma } from "../src/server/db";

type ImportMode = "error" | "replace";

function normalizeNotionId(id: string): string {
    return id.replace(/-/g, "").trim();
}

function requireEnv(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`${name} is required`);
    return v;
}

function asRichTextPlain(prop: any): string {
    const rt = prop?.type === "rich_text" ? prop.rich_text : null;
    if (!Array.isArray(rt)) return "";
    return rt.map((x: any) => x?.plain_text ?? "").join("").trim();
}

function asTitlePlain(prop: any): string {
    const t = prop?.type === "title" ? prop.title : null;
    if (!Array.isArray(t)) return "";
    return t.map((x: any) => x?.plain_text ?? "").join("").trim();
}

function asSelectName(prop: any): string {
    if (prop?.type !== "select") return "";
    return prop.select?.name?.trim?.() ?? "";
}

function asMultiSelectFirstName(prop: any): string {
    if (prop?.type !== "multi_select") return "";
    const first = Array.isArray(prop.multi_select) ? prop.multi_select[0] : null;
    return first?.name?.trim?.() ?? "";
}

function asSelectOrMultiSelectFirstName(prop: any): string {
    return asSelectName(prop) || asMultiSelectFirstName(prop);
}

function asAnyText(prop: any): string {
    return asRichTextPlain(prop) || asTitlePlain(prop) || "";
}

function asUrlPlain(prop: any): string {
    if (prop?.type !== "url") return "";
    return String(prop.url ?? "").trim();
}

function asAnyTextOrUrl(prop: any): string {
    return asUrlPlain(prop) || asAnyText(prop);
}

function asBoolFromText(prop: any): boolean | null {
    const s = asAnyText(prop).trim().toLowerCase();
    if (!s) return null;
    if (["true", "yes", "y", "1"].includes(s)) return true;
    if (["false", "no", "n", "0"].includes(s)) return false;
    return null;
}

function asNumberFromText(prop: any): number | null {
    const s = asAnyText(prop).trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

function stripWrappingQuotes(s: string): string {
    return s.replace(/^"+/, "").replace(/"+$/, "").trim();
}

function normalizeImportedText(value: string): string {
    let s = value.trim();

    // Strip extra wrapping quotes often introduced via CSV paste.
    // IMPORTANT: Do NOT JSON.parse() here; many valid LaTeX strings contain sequences like
    // 	an or \frac that would be misread as JSON escapes (\t, \f) and become control chars.
    s = stripWrappingQuotes(s);

    // Unescape common double-escaped artifacts.
    s = s.replace(/\\"/g, '"');
    s = s.replace(/\\'/g, "'");
    // Only convert \n/\r/\t when they are likely intended as escapes,
    // and avoid breaking LaTeX commands like \nu.
    s = s.replace(/\\n(?![A-Za-z])/g, "\n");
    s = s.replace(/\\r(?![A-Za-z])/g, "\r");
    s = s.replace(/\\t(?![A-Za-z])/g, "\t");

    return s.trim();
}

function nullLikeToEmpty(value: string): string {
    const s = value.trim();
    if (!s) return "";
    const lower = s.toLowerCase();
    if (lower === "null" || lower === "none" || lower === "n/a" || lower === "na" || lower === "-") return "";
    return s;
}

function assertBalancedDollarDelimiters(args: {
    pageId: string;
    testTitle: string;
    orderIndex: number | null;
    subjectName: string;
    field: string;
    value: string;
}) {
    const dollarCount = (args.value.match(/\$/g) ?? []).length;
    if (dollarCount % 2 === 1) {
        const preview = args.value.length > 180 ? `${args.value.slice(0, 180)}…` : args.value;
        throw new Error(
            `Notion row ${args.pageId} has unbalanced $ in ${args.field} (test="${args.testTitle}", subject="${args.subjectName}", order=${args.orderIndex ?? "?"}).\n` +
            `Fix the LaTeX delimiters in Notion so $...$ pairs are complete.\n` +
            `Value preview: ${JSON.stringify(preview)}`,
        );
    }
}

function asNumber(prop: any): number | null {
    if (prop?.type !== "number") return null;
    return typeof prop.number === "number" ? prop.number : null;
}

function asIntFromText(prop: any): number | null {
    const s = asRichTextPlain(prop) || asTitlePlain(prop);
    if (!s) return null;
    const n = Number(String(s).trim());
    return Number.isInteger(n) ? n : null;
}

function getProp(props: Record<string, any>, name: string): any {
    if (name in props) return props[name];
    const want = name.trim().toLowerCase();
    for (const key of Object.keys(props)) {
        if (key.trim().toLowerCase() === want) return props[key];
    }
    return undefined;
}

function asCheckbox(prop: any): boolean {
    if (prop?.type !== "checkbox") return false;
    return Boolean(prop.checkbox);
}

function parseImageUrls(raw: string): string[] {
    return raw
        .split(/\r?\n|,|;/g)
        .map((s) => s.trim())
        .filter((s) => Boolean(nullLikeToEmpty(s)))
        .map((s) => nullLikeToEmpty(s));
}

function subjectIdFromName(name: string): number {
    const n = name.toLowerCase();
    if (n === "physics") return 1;
    if (n === "chemistry") return 2;
    if (n === "mathematics" || n === "maths" || n === "math") return 3;
    throw new Error(`Unknown subject: ${name}`);
}

async function main() {
    const notionToken = requireEnv("NOTION_TOKEN");
    const databaseIdInput = requireEnv("NOTION_DATABASE_ID");
    const databaseTitleHint = process.env.NOTION_DATABASE_TITLE?.trim() || "";
    const mode = (process.env.NOTION_IMPORT_MODE ?? "error") as ImportMode;

    if (mode !== "error" && mode !== "replace") {
        throw new Error(`NOTION_IMPORT_MODE must be "error" or "replace" (got ${mode})`);
    }

    const notion = new Client({ auth: notionToken });

    async function listChildDatabases(pageId: string) {
        const databases: Array<{ id: string; title: string }> = [];

        let cursor: string | undefined = undefined;
        for (; ;) {
            const resp = await notion.blocks.children.list({
                block_id: normalizeNotionId(pageId),
                start_cursor: cursor,
                page_size: 100,
            });

            for (const block of resp.results as any[]) {
                if (block?.type === "child_database") {
                    databases.push({
                        id: block.id,
                        title: String(block.child_database?.title ?? "").trim(),
                    });
                }
            }

            if (!resp.has_more) break;
            cursor = resp.next_cursor ?? undefined;
        }

        return databases;
    }

    async function resolveDatabaseId(idOrPage: string): Promise<string> {
        const id = normalizeNotionId(idOrPage);

        // First try: treat it as a database id.
        try {
            await notion.databases.retrieve({ database_id: id });
            return id;
        } catch (e: any) {
            const msg = typeof e?.message === "string" ? e.message : "";
            const code = typeof e?.code === "string" ? e.code : "";

            // Fallback: treat it as a page containing an embedded database.
            if (code !== "validation_error" && !msg.toLowerCase().includes("not a database")) {
                throw e;
            }

            const dbs = await listChildDatabases(id);
            if (dbs.length === 0) {
                throw new Error(
                    `NOTION_DATABASE_ID is a page, but no embedded database was found on that page. Create a Notion database on the page and share it with the integration.`,
                );
            }

            if (databaseTitleHint) {
                const match = dbs.find(
                    (d) => d.title.toLowerCase() === databaseTitleHint.toLowerCase(),
                );
                if (match) return normalizeNotionId(match.id);
                throw new Error(
                    `Multiple databases found on the page, but none matched NOTION_DATABASE_TITLE="${databaseTitleHint}". Found: ${dbs
                        .map((d) => d.title || d.id)
                        .join(", ")}`,
                );
            }

            if (dbs.length > 1) {
                console.warn(
                    `Multiple databases found on the page. Using the first one: "${dbs[0].title || dbs[0].id}". Set NOTION_DATABASE_TITLE to pick a specific one.`,
                );
            }

            return normalizeNotionId(dbs[0].id);
        }
    }

    const databaseId = await resolveDatabaseId(databaseIdInput);

    // Ensure canonical subjects exist (matches current repo seed).
    await prisma.subjectCategory.upsert({ where: { id: 1 }, update: { name: "Physics" }, create: { id: 1, name: "Physics" } });
    await prisma.subjectCategory.upsert({ where: { id: 2 }, update: { name: "Chemistry" }, create: { id: 2, name: "Chemistry" } });
    await prisma.subjectCategory.upsert({ where: { id: 3 }, update: { name: "Mathematics" }, create: { id: 3, name: "Mathematics" } });

    type Row = {
        testTitle: string;
        totalDurationMinutes: number;
        isAdvancedFormat: boolean;
        orderIndex: number;
        subjectId: number;
        topicName: string;
        scheme: "MAINS_SINGLE" | "MAINS_NUMERICAL";
        questionText: string;
        options: Record<string, string | { text: string; imageUrl: string | null }>;
        correctAnswer: string | number;
        difficultyRank: number | null;
        imageUrls: string[];
        sourcePageId: string;
    };

    const rows: Row[] = [];

    let cursor: string | undefined = undefined;
    for (; ;) {
        const resp = await notion.databases.query({
            database_id: databaseId,
            start_cursor: cursor,
            page_size: 100,
        });

        for (const page of resp.results as any[]) {
            const props = page.properties ?? {};

            // Property names expected in your Notion database:
            // Test Title (rich_text or title), Duration Minutes (number), Advanced (checkbox),
            // Order (number), Subject (select), Topic (rich_text), Type (select: MCQ|Numerical),
            // Question (rich_text), Option A/B/C/D (rich_text), Correct Option (select A-D),
            // Correct Integer (number), Question URLs/Image URLs (rich_text or url), Difficulty (number)

            const testTitleProp = getProp(props, "Test Title");
            const durationProp = getProp(props, "Duration Minutes");
            const advancedProp = getProp(props, "Advanced");
            const orderProp = getProp(props, "Order");
            const subjectProp = getProp(props, "Subject");
            const topicProp = getProp(props, "Topic");
            const typeProp = getProp(props, "Type");
            const questionProp = getProp(props, "Question");

            const testTitle = normalizeImportedText(
                asRichTextPlain(testTitleProp) || asTitlePlain(testTitleProp) || "",
            );
            const duration = asNumber(durationProp) ?? asNumberFromText(durationProp) ?? 180;
            const isAdvanced = asCheckbox(advancedProp) || (asBoolFromText(advancedProp) ?? false);
            const orderIndexNum = asNumber(orderProp) ?? asIntFromText(orderProp);
            const subjectName = normalizeImportedText(
                asSelectOrMultiSelectFirstName(subjectProp) || asAnyText(subjectProp),
            );
            const topicName = normalizeImportedText(asRichTextPlain(topicProp) || "");
            const type = (asSelectOrMultiSelectFirstName(typeProp) || asAnyText(typeProp)).toLowerCase();
            const questionText = normalizeImportedText(asRichTextPlain(questionProp) || "");

            const optA = normalizeImportedText(asRichTextPlain(getProp(props, "Option A")));
            const optB = normalizeImportedText(asRichTextPlain(getProp(props, "Option B")));
            const optC = normalizeImportedText(asRichTextPlain(getProp(props, "Option C")));
            const optD = normalizeImportedText(asRichTextPlain(getProp(props, "Option D")));

            const optAImg = nullLikeToEmpty(
                normalizeImportedText(asAnyTextOrUrl(getProp(props, "Option A Image URL"))),
            );
            const optBImg = nullLikeToEmpty(
                normalizeImportedText(asAnyTextOrUrl(getProp(props, "Option B Image URL"))),
            );
            const optCImg = nullLikeToEmpty(
                normalizeImportedText(asAnyTextOrUrl(getProp(props, "Option C Image URL"))),
            );
            const optDImg = nullLikeToEmpty(
                normalizeImportedText(asAnyTextOrUrl(getProp(props, "Option D Image URL"))),
            );

            const correctOpt = (
                asSelectOrMultiSelectFirstName(getProp(props, "Correct Option")) ||
                asAnyText(getProp(props, "Correct Option"))
            )
                .trim()
                .toUpperCase();
            const correctInt =
                asNumber(getProp(props, "Correct Integer")) ??
                asIntFromText(getProp(props, "Correct Integer"));

            const imageUrlsRaw = nullLikeToEmpty(
                normalizeImportedText(
                    asAnyTextOrUrl(getProp(props, "Question URLs")) ||
                    asAnyTextOrUrl(getProp(props, "Question URL")) ||
                    asAnyTextOrUrl(getProp(props, "Question Image URLs")) ||
                    asAnyTextOrUrl(getProp(props, "Question Image URL")) ||
                    asAnyTextOrUrl(getProp(props, "Image URLs")) ||
                    asAnyTextOrUrl(getProp(props, "Image URL")),
                ),
            );
            const difficultyRank =
                asNumber(getProp(props, "Difficulty")) ??
                asNumberFromText(getProp(props, "Difficulty"));

            // Notion databases often contain an empty placeholder/template row.
            // If the row is completely empty across all relevant fields, skip it.
            const isCompletelyEmptyRow =
                !testTitle &&
                !subjectName &&
                !topicName &&
                !questionText &&
                !type &&
                orderIndexNum == null &&
                !optA &&
                !optB &&
                !optC &&
                !optD &&
                !optAImg &&
                !optBImg &&
                !optCImg &&
                !optDImg &&
                !correctOpt &&
                correctInt == null &&
                !imageUrlsRaw &&
                difficultyRank == null;

            if (isCompletelyEmptyRow) {
                console.warn(`Skipping empty Notion row: ${page.id}`);
                continue;
            }

            const missing: string[] = [];
            if (!testTitle) missing.push("Test Title");
            if (!subjectName) missing.push("Subject");
            if (!topicName) missing.push("Topic");
            if (!questionText) missing.push("Question");
            if (orderIndexNum == null) missing.push("Order");
            if (!type) missing.push("Type");

            if (missing.length) {
                const propTypes = Object.fromEntries(
                    Object.entries(props as Record<string, any>).map(([k, v]) => [
                        k,
                        v?.type ?? "unknown",
                    ]),
                );
                throw new Error(
                    `Notion row ${page.id} missing required fields: ${missing.join(", ")}\nAvailable properties: ${JSON.stringify(
                        propTypes,
                        null,
                        2,
                    )}`,
                );
            }

            if (orderIndexNum == null) {
                throw new Error(`Notion row ${page.id} missing required field: Order`);
            }

            // Hard validation: prevent broken MathJax/LaTeX from entering DB.
            assertBalancedDollarDelimiters({
                pageId: page.id,
                testTitle,
                orderIndex: orderIndexNum,
                subjectName,
                field: "Question",
                value: questionText,
            });
            assertBalancedDollarDelimiters({
                pageId: page.id,
                testTitle,
                orderIndex: orderIndexNum,
                subjectName,
                field: "Option A",
                value: optA,
            });
            assertBalancedDollarDelimiters({
                pageId: page.id,
                testTitle,
                orderIndex: orderIndexNum,
                subjectName,
                field: "Option B",
                value: optB,
            });
            assertBalancedDollarDelimiters({
                pageId: page.id,
                testTitle,
                orderIndex: orderIndexNum,
                subjectName,
                field: "Option C",
                value: optC,
            });
            assertBalancedDollarDelimiters({
                pageId: page.id,
                testTitle,
                orderIndex: orderIndexNum,
                subjectName,
                field: "Option D",
                value: optD,
            });

            const subjectId = subjectIdFromName(subjectName);

            let scheme: Row["scheme"];
            let options: Record<string, string | { text: string; imageUrl: string | null }> = {};
            let correctAnswer: string | number;

            if (type === "mcq") {
                scheme = "MAINS_SINGLE";
                const hasA = Boolean(optA || optAImg);
                const hasB = Boolean(optB || optBImg);
                const hasC = Boolean(optC || optCImg);
                const hasD = Boolean(optD || optDImg);
                if (![hasA, hasB, hasC, hasD].every(Boolean)) {
                    throw new Error(
                        `Notion row ${page.id} MCQ requires 4 options; each option needs text and/or image URL`,
                    );
                }
                if (!["A", "B", "C", "D"].includes(correctOpt)) {
                    throw new Error(`Notion row ${page.id} MCQ requires Correct Option select A/B/C/D`);
                }
                options = {
                    A: { text: optA, imageUrl: optAImg || null },
                    B: { text: optB, imageUrl: optBImg || null },
                    C: { text: optC, imageUrl: optCImg || null },
                    D: { text: optD, imageUrl: optDImg || null },
                };
                correctAnswer = correctOpt;
            } else if (type === "numerical" || type === "numeric") {
                scheme = "MAINS_NUMERICAL";
                if (correctInt == null || !Number.isInteger(correctInt)) {
                    throw new Error(`Notion row ${page.id} Numerical requires integer Correct Integer`);
                }
                correctAnswer = correctInt;
            } else {
                throw new Error(`Notion row ${page.id} Type must be MCQ or Numerical (got ${type})`);
            }

            rows.push({
                testTitle,
                totalDurationMinutes: duration,
                isAdvancedFormat: isAdvanced,
                orderIndex: orderIndexNum,
                subjectId,
                topicName,
                scheme,
                questionText,
                options,
                correctAnswer,
                difficultyRank: typeof difficultyRank === "number" ? difficultyRank : null,
                imageUrls: parseImageUrls(imageUrlsRaw),
                sourcePageId: page.id,
            });
        }

        if (!resp.has_more) break;
        cursor = resp.next_cursor ?? undefined;
    }

    // Group by test title.
    const tests = new Map<string, Row[]>();
    for (const r of rows) {
        const arr = tests.get(r.testTitle) ?? [];
        arr.push(r);
        tests.set(r.testTitle, arr);
    }

    for (const [title, testRows] of tests.entries()) {
        testRows.sort((a, b) => a.orderIndex - b.orderIndex);

        const existing = await prisma.testSeries.findFirst({
            where: { title },
            select: {
                id: true,
                questions: { select: { questionId: true } },
            },
        });
        if (existing) {
            if (mode === "replace") {
                const oldQuestionIds = existing.questions.map((q) => q.questionId);

                // Replace mode is intentionally destructive:
                // - Deletes attempts for this test (and cascades responses/activities/issue reports)
                // - Deletes the test
                // - Deletes now-orphaned questions that were only attached to this test
                await prisma.studentAttempt.deleteMany({ where: { testId: existing.id } });
                await prisma.testSeries.delete({ where: { id: existing.id } });

                if (oldQuestionIds.length) {
                    await prisma.question.deleteMany({
                        where: {
                            id: { in: oldQuestionIds },
                            tests: { none: {} },
                        },
                    });
                }
            } else {
                throw new Error(
                    `Test already exists with title "${title}". Set NOTION_IMPORT_MODE=replace to overwrite.`,
                );
            }
        }

        const duration = testRows[0]?.totalDurationMinutes ?? 180;
        const isAdvanced = Boolean(testRows[0]?.isAdvancedFormat);

        // Consistency check
        for (const r of testRows) {
            if (r.totalDurationMinutes !== duration) {
                throw new Error(`Inconsistent Duration Minutes for test "${title}"`);
            }
            if (r.isAdvancedFormat !== isAdvanced) {
                throw new Error(`Inconsistent Advanced flag for test "${title}"`);
            }
        }

        const createdQuestions: Array<{ id: string }> = [];
        for (const r of testRows) {
            const q = await prisma.question.create({
                data: {
                    subjectId: r.subjectId,
                    topicName: r.topicName,
                    questionText: r.questionText,
                    imageUrls: r.imageUrls.length ? r.imageUrls : undefined,
                    options: r.options,
                    correctAnswer: r.correctAnswer,
                    markingSchemeType: r.scheme,
                    difficultyRank: r.difficultyRank ?? undefined,
                },
                select: { id: true },
            });
            createdQuestions.push(q);
        }

        const test = await prisma.testSeries.create({
            data: {
                title,
                totalDurationMinutes: duration,
                isAdvancedFormat: isAdvanced,
                questions: {
                    create: createdQuestions.map((q, idx) => ({
                        questionId: q.id,
                        orderIndex: idx,
                    })),
                },
            },
            select: { id: true },
        });

        // Optional validation: JEE Main-like (per subject 20 MCQ + 5 Numerical)
        const bySubject = new Map<number, { mcq: number; num: number }>();
        for (const r of testRows) {
            const v = bySubject.get(r.subjectId) ?? { mcq: 0, num: 0 };
            if (r.scheme === "MAINS_SINGLE") v.mcq += 1;
            else v.num += 1;
            bySubject.set(r.subjectId, v);
        }

        console.log(`Imported test ${test.id} "${title}" (${testRows.length} questions)`);
        for (const [sid, counts] of bySubject.entries()) {
            const name = sid === 1 ? "Physics" : sid === 2 ? "Chemistry" : "Mathematics";
            console.log(`  - ${name}: ${counts.mcq} MCQ, ${counts.num} Numerical`);
        }
    }

    console.log("Notion import complete.");
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
