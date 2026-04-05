import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "@notionhq/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/server/db";

type SubjectCode = "PHYSICS" | "CHEMISTRY" | "MATHEMATICS";
type QuestionType = "SINGLE_CORRECT" | "MULTI_CORRECT" | "MATCHING_LIST" | "NAT_INTEGER" | "NAT_DECIMAL";
type BlockType = "QUESTION" | "PARAGRAPH";

type QuestionInput = {
    questionType: QuestionType;
    stemRich: string;
    stemAssets?: unknown;
    payload?: unknown;
    difficultyRank?: number | null;
    markingSchemeName?: string;
    options?: Array<{
        optionKey: string;
        labelRich: string;
        assets?: unknown;
        isCorrect?: boolean;
    }>;
    matchItems?: Array<{
        listName: string;
        itemKey: string;
        labelRich: string;
    }>;
};

type BlockInput = {
    blockType: BlockType;
    paragraphRich?: string;
    paragraphAssets?: unknown;
    questions: QuestionInput[];
};

type SectionInput = {
    sectionCode: string;
    title: string;
    instructionsRich?: string;
    config?: unknown;
    blocks: BlockInput[];
};

type SubjectInput = {
    subject: SubjectCode;
    sections: SectionInput[];
};

type PaperInput = {
    code: string;
    title: string;
    durationMinutes: number;
    instructionsRichText?: string;
    isActive?: boolean;
    subjects: SubjectInput[];
};

type PaperSet = { papers: PaperInput[] };

const DEFAULT_TEMPLATE_PATH = join(process.cwd(), "docs/advanced-paper/advanced-paper-set.template.json");

const NOTION_JSON_FIELDS = [
    "Paper Set JSON",
    "Paper JSON",
    "JSON",
    "Payload",
    "Schema",
] as const;

function normalizeNotionId(id: string): string {
    return id.replace(/-/g, "").trim();
}

function requireEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is required`);
    return value;
}

function getProp(props: Record<string, unknown>, name: string): unknown {
    if (name in props) return props[name];
    const want = name.toLowerCase();
    for (const key of Object.keys(props)) {
        if (key.toLowerCase() === want) return props[key];
    }
    return undefined;
}

function asTitlePlain(prop: any): string {
    const arr = prop?.type === "title" ? prop.title : null;
    if (!Array.isArray(arr)) return "";
    return arr.map((x: any) => x?.plain_text ?? "").join("").trim();
}

function asRichTextPlain(prop: any): string {
    const arr = prop?.type === "rich_text" ? prop.rich_text : null;
    if (!Array.isArray(arr)) return "";
    return arr.map((x: any) => x?.plain_text ?? "").join("").trim();
}

function asSelectPlain(prop: any): string {
    if (prop?.type === "select") return String(prop.select?.name ?? "").trim();
    if (prop?.type === "multi_select") {
        const first = Array.isArray(prop.multi_select) ? prop.multi_select[0] : null;
        return String(first?.name ?? "").trim();
    }
    return "";
}

function asNumber(prop: any): number | null {
    if (prop?.type !== "number") return null;
    return typeof prop.number === "number" ? prop.number : null;
}

function asIntFromAny(prop: any): number | null {
    const fromNumber = asNumber(prop);
    if (fromNumber != null && Number.isInteger(fromNumber)) return fromNumber;

    const raw = asAnyPlain(prop);
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isInteger(parsed) ? parsed : null;
}

function asCheckbox(prop: any): boolean | null {
    if (prop?.type !== "checkbox") return null;
    return Boolean(prop.checkbox);
}

function asAnyPlain(prop: any): string {
    return asRichTextPlain(prop) || asTitlePlain(prop) || asSelectPlain(prop);
}

function splitAnswerTokens(raw: string): string[] {
    return raw
        .split(/[;,|]/g)
        .flatMap((part) => part.split(/\s+/g))
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
}

function toQuestionType(raw: string): QuestionType {
    const v = raw.trim().toUpperCase();
    if (v === "SINGLE_CORRECT" || v === "MCQ" || v === "SINGLE") return "SINGLE_CORRECT";
    if (v === "MULTI_CORRECT" || v === "MULTI" || v === "MSQ") return "MULTI_CORRECT";
    if (v === "MATCHING_LIST" || v === "MATCHING") return "MATCHING_LIST";
    if (v === "NAT_INTEGER" || v === "INTEGER" || v === "NAT_INT") return "NAT_INTEGER";
    if (v === "NAT_DECIMAL" || v === "DECIMAL" || v === "NAT") return "NAT_DECIMAL";
    throw new Error(`Unsupported QuestionType value: ${raw}`);
}

function subjectEnum(raw: string): SubjectCode {
    const v = raw.trim().toUpperCase();
    if (v === "PHYSICS" || v === "PHY") return "PHYSICS";
    if (v === "CHEMISTRY" || v === "CHEM") return "CHEMISTRY";
    if (v === "MATHEMATICS" || v === "MATH" || v === "MATHS" || v === "MAT") return "MATHEMATICS";
    throw new Error(`Unsupported Subject value: ${raw}`);
}

function findPropValue(props: Record<string, unknown>, names: string[]): unknown {
    for (const name of names) {
        const v = getProp(props, name);
        if (v != null) return v;
    }
    return undefined;
}

function paperCodeBaseFromTitle(title: string): string {
    const base = title
        .toUpperCase()
        .replace(/[^A-Z0-9_-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^[-_]+|[-_]+$/g, "")
        .slice(0, 64);

    return base || "ADV-NOTION-PAPER";
}

function makeUniquePaperCode(title: string, usedCodes: Set<string>): string {
    const base = paperCodeBaseFromTitle(title);
    if (!usedCodes.has(base)) return base;

    let idx = 2;
    for (; ;) {
        const suffix = `-${idx}`;
        const prefix = base.slice(0, Math.max(3, 64 - suffix.length));
        const candidate = `${prefix}${suffix}`;
        if (!usedCodes.has(candidate)) return candidate;
        idx += 1;
    }
}

type NotionQuestionRow = {
    paperCode: string;
    paperTitle: string;
    durationMinutes: number;
    instructionsRichText: string;
    isActive: boolean;
    subject: SubjectCode;
    sectionCode: string;
    sectionTitle: string;
    questionType: QuestionType;
    stemRich: string;
    stemAssets?: unknown;
    payload?: unknown;
    qNo: number;
    options?: QuestionInput["options"];
    matchItems?: QuestionInput["matchItems"];
    markingSchemeName?: string;
};

function buildQuestionFromRow(row: NotionQuestionRow): QuestionInput {
    const base: QuestionInput = {
        questionType: row.questionType,
        stemRich: row.stemRich,
        stemAssets: row.stemAssets,
        payload: row.payload,
        markingSchemeName: row.markingSchemeName,
        options: row.options,
        matchItems: row.matchItems,
    };

    if (!base.markingSchemeName) {
        if (row.questionType === "SINGLE_CORRECT") base.markingSchemeName = "V2_ADV_SINGLE_3N1";
        if (row.questionType === "MATCHING_LIST") base.markingSchemeName = "V2_ADV_MATCH_3N1";
        if (row.questionType === "MULTI_CORRECT") base.markingSchemeName = "V2_ADV_MULTI_4_3_2_1_N2";
        if (row.questionType === "NAT_INTEGER") base.markingSchemeName = "V2_ADV_NAT_INTEGER_4N0";
        if (row.questionType === "NAT_DECIMAL") base.markingSchemeName = "V2_ADV_NAT_DECIMAL_3N0";
    }

    return base;
}

function rowsToPapers(rows: NotionQuestionRow[]): PaperInput[] {
    const paperMap = new Map<string, {
        code: string;
        title: string;
        durationMinutes: number;
        instructionsRichText?: string;
        isActive?: boolean;
        subjects: Map<SubjectCode, { sections: Map<string, { title: string; questions: Array<{ qNo: number; q: QuestionInput }> }> }>;
    }>();

    for (const row of rows) {
        const paper = paperMap.get(row.paperCode) ?? {
            code: row.paperCode,
            title: row.paperTitle,
            durationMinutes: row.durationMinutes,
            instructionsRichText: row.instructionsRichText || undefined,
            isActive: row.isActive,
            subjects: new Map(),
        };
        paperMap.set(row.paperCode, paper);

        const subjectNode = paper.subjects.get(row.subject) ?? { sections: new Map() };
        paper.subjects.set(row.subject, subjectNode);

        const sectionNode = subjectNode.sections.get(row.sectionCode) ?? {
            title: row.sectionTitle,
            questions: [],
        };
        subjectNode.sections.set(row.sectionCode, sectionNode);

        sectionNode.questions.push({ qNo: row.qNo, q: buildQuestionFromRow(row) });
    }

    const papers: PaperInput[] = [];

    const subjectOrder: Record<SubjectCode, number> = {
        PHYSICS: 0,
        CHEMISTRY: 1,
        MATHEMATICS: 2,
    };

    for (const p of paperMap.values()) {
        const subjects: SubjectInput[] = Array.from(p.subjects.entries())
            .sort((a, b) => subjectOrder[a[0]] - subjectOrder[b[0]])
            .map(([subject, subjectNode]) => {
                const sections: SectionInput[] = Array.from(subjectNode.sections.entries())
                    .map(([sectionCode, sec]) => ({
                        sectionCode,
                        title: sec.title,
                        minQNo: sec.questions.reduce((min, item) => Math.min(min, item.qNo), Number.POSITIVE_INFINITY),
                        questions: sec.questions
                            .sort((a, b) => a.qNo - b.qNo)
                            .map((x) => x.q),
                    }))
                    .sort((a, b) => {
                        if (a.minQNo !== b.minQNo) return a.minQNo - b.minQNo;
                        return a.sectionCode.localeCompare(b.sectionCode);
                    })
                    .map((sec) => ({
                        sectionCode: sec.sectionCode,
                        title: sec.title,
                        blocks: [
                            {
                                blockType: "QUESTION" as const,
                                questions: sec.questions,
                            },
                        ],
                    }));

                return { subject, sections };
            });

        papers.push({
            code: p.code,
            title: p.title,
            durationMinutes: p.durationMinutes,
            instructionsRichText: p.instructionsRichText,
            isActive: p.isActive,
            subjects,
        });
    }

    return papers;
}

function stripCodeFence(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed.startsWith("```")) return trimmed;
    const lines = trimmed.split(/\r?\n/);
    if (lines.length < 3) return trimmed;
    if (!lines[0].startsWith("```")) return trimmed;
    if (!lines[lines.length - 1].startsWith("```")) return trimmed;
    return lines.slice(1, -1).join("\n").trim();
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value != null && !Array.isArray(value);
}

function parsePaperLike(raw: string): PaperInput[] {
    const parsed = JSON.parse(stripCodeFence(raw));
    if (isObject(parsed) && Array.isArray(parsed.papers)) {
        return parsed.papers as PaperInput[];
    }
    if (isObject(parsed) && typeof parsed.code === "string") {
        return [parsed as PaperInput];
    }
    throw new Error("JSON must be either { papers: [...] } or a single paper object");
}

function tryParsePaperLike(raw: string): PaperInput[] | null {
    try {
        return parsePaperLike(raw);
    } catch {
        return null;
    }
}

function validatePaper(paper: PaperInput, index: number) {
    if (!paper.code || !/^[A-Za-z0-9_-]{3,64}$/.test(paper.code)) {
        throw new Error(`papers[${index}].code is invalid`);
    }
    if (!paper.title || paper.title.trim().length < 3) {
        throw new Error(`papers[${index}].title is invalid`);
    }
    if (!Number.isInteger(paper.durationMinutes) || paper.durationMinutes < 1 || paper.durationMinutes > 720) {
        throw new Error(`papers[${index}].durationMinutes must be an integer between 1 and 720`);
    }
    if (!Array.isArray(paper.subjects) || paper.subjects.length === 0) {
        throw new Error(`papers[${index}].subjects must have at least 1 subject`);
    }
}

async function resolveDatabaseId(notion: Client, idOrPage: string): Promise<string> {
    const normalized = normalizeNotionId(idOrPage);
    try {
        await notion.databases.retrieve({ database_id: normalized });
        return normalized;
    } catch {
        let cursor: string | undefined = undefined;
        const children: Array<{ id: string; title: string }> = [];
        for (; ;) {
            const resp = await notion.blocks.children.list({
                block_id: normalized,
                start_cursor: cursor,
                page_size: 100,
            });
            for (const block of resp.results as any[]) {
                if (block?.type === "child_database") {
                    children.push({
                        id: normalizeNotionId(block.id),
                        title: String(block.child_database?.title ?? "").trim(),
                    });
                }
            }
            if (!resp.has_more) break;
            cursor = resp.next_cursor ?? undefined;
        }

        if (children.length === 0) {
            throw new Error("NOTION_DATABASE_ID is not a database id and has no child database blocks.");
        }

        const hint = process.env.NOTION_DATABASE_TITLE?.trim();
        if (hint) {
            const match = children.find((d) => d.title.toLowerCase() === hint.toLowerCase());
            if (!match) {
                throw new Error(`No child database matched NOTION_DATABASE_TITLE=\"${hint}\"`);
            }
            return match.id;
        }

        return children[0].id;
    }
}

async function loadPapersFromNotion(): Promise<PaperInput[]> {
    const notionToken = requireEnv("NOTION_TOKEN");
    const notionDatabaseId = requireEnv("NOTION_DATABASE_ID");

    const notion = new Client({ auth: notionToken });
    const databaseId = await resolveDatabaseId(notion, notionDatabaseId);

    const papers: PaperInput[] = [];
    const rows: NotionQuestionRow[] = [];
    const observedTextProps = new Set<string>();
    const usedPaperCodes = new Set<string>();
    const generatedCodeByTitleKey = new Map<string, string>();
    let cursor: string | undefined = undefined;

    const appendParsedPapers = (list: PaperInput[]) => {
        for (const paper of list) {
            papers.push(paper);
            if (paper.code) usedPaperCodes.add(paper.code);
        }
    };

    for (; ;) {
        const resp = await notion.databases.query({
            database_id: databaseId,
            start_cursor: cursor,
            page_size: 100,
        });

        for (const page of resp.results as any[]) {
            if (page?.object !== "page") continue;
            const props = (page.properties ?? {}) as Record<string, unknown>;

            let parsedFromNamedField: PaperInput[] | null = null;
            for (const field of NOTION_JSON_FIELDS) {
                const prop = getProp(props, field);
                const raw = asRichTextPlain(prop) || asTitlePlain(prop);
                if (!raw) continue;
                const parsed = tryParsePaperLike(raw);
                if (parsed) {
                    parsedFromNamedField = parsed;
                    break;
                }
            }

            if (parsedFromNamedField) {
                appendParsedPapers(parsedFromNamedField);
                continue;
            }

            // Fallback: scan every title/rich_text property and parse the first JSON-shaped payload.
            for (const [propName, prop] of Object.entries(props)) {
                const raw = asRichTextPlain(prop) || asTitlePlain(prop);
                if (!raw) continue;
                observedTextProps.add(propName);
                const parsed = tryParsePaperLike(raw);
                if (!parsed) continue;
                appendParsedPapers(parsed);
                break;
            }

            if (papers.length === 0) {
                const subjectRaw = asAnyPlain(findPropValue(props, ["Subject"]));
                const sectionCodeRaw = asAnyPlain(findPropValue(props, ["SectionCode", "Section Code"]));
                const questionTypeRaw = asAnyPlain(findPropValue(props, ["QuestionType", "Question Type", "Type"]));
                const stemRichRaw = asAnyPlain(findPropValue(props, ["StemRich", "Question", "Stem"]));

                if (subjectRaw && sectionCodeRaw && questionTypeRaw && stemRichRaw) {
                    const rowLooksLikeHeader =
                        subjectRaw.trim().toLowerCase() === "subject" ||
                        sectionCodeRaw.trim().toLowerCase() === "sectioncode" ||
                        questionTypeRaw.trim().toLowerCase() === "questiontype" ||
                        stemRichRaw.trim().toLowerCase() === "stemrich";
                    if (rowLooksLikeHeader) continue;

                    const correctAnswerRaw = asAnyPlain(findPropValue(props, ["CorrectAnswer", "Correct Answer"]));
                    const optionA = asAnyPlain(findPropValue(props, ["Option_A", "Option A"]));
                    const optionB = asAnyPlain(findPropValue(props, ["Option_B", "Option B"]));
                    const optionC = asAnyPlain(findPropValue(props, ["Option_C", "Option C"]));
                    const optionD = asAnyPlain(findPropValue(props, ["Option_D", "Option D"]));

                    const qType = toQuestionType(questionTypeRaw);
                    const correctTokens = splitAnswerTokens(correctAnswerRaw);
                    const correctSet = new Set(correctTokens);
                    const topicRaw = asAnyPlain(findPropValue(props, ["Topic", "TopicName", "Topic Name", "Chapter", "ChapterName"]));

                    const qNoFromSource = asIntFromAny(findPropValue(props, ["Q_No", "Q No", "QNo", "Question No", "Order"]));

                    let payload: unknown = undefined;
                    if (qType === "SINGLE_CORRECT") payload = { correctAnswer: correctTokens[0] ?? "" };
                    if (qType === "MULTI_CORRECT") payload = { correctAnswer: correctTokens };
                    if (qType === "NAT_INTEGER") payload = { correctAnswer: Number.parseInt(correctAnswerRaw, 10) };
                    if (qType === "NAT_DECIMAL") payload = { correctAnswer: Number.parseFloat(correctAnswerRaw) };
                    if (qType === "MATCHING_LIST" && correctAnswerRaw) payload = { correctAnswer: correctAnswerRaw };
                    if (topicRaw) {
                        const payloadObj = (payload && typeof payload === "object" && !Array.isArray(payload))
                            ? (payload as Record<string, unknown>)
                            : {};
                        payload = { ...payloadObj, topicName: topicRaw };
                    }

                    if (qNoFromSource != null) {
                        const payloadObj = (payload && typeof payload === "object" && !Array.isArray(payload))
                            ? (payload as Record<string, unknown>)
                            : {};
                        payload = { ...payloadObj, qNo: qNoFromSource };
                    }

                    const options = (qType === "SINGLE_CORRECT" || qType === "MULTI_CORRECT" || qType === "MATCHING_LIST")
                        ? [
                            { optionKey: "A", labelRich: optionA, isCorrect: correctSet.has("A") },
                            { optionKey: "B", labelRich: optionB, isCorrect: correctSet.has("B") },
                            { optionKey: "C", labelRich: optionC, isCorrect: correctSet.has("C") },
                            { optionKey: "D", labelRich: optionD, isCorrect: correctSet.has("D") },
                        ].filter((o) => o.labelRich.trim().length > 0)
                        : undefined;

                    const qNo = qNoFromSource ?? 999999;
                    const duration = asNumber(findPropValue(props, ["DurationMinutes", "Duration Minutes"])) ?? 180;
                    const isActive = asCheckbox(findPropValue(props, ["IsActive", "Active"])) ?? true;
                    const explicitPaperCode = asAnyPlain(findPropValue(props, ["PaperCode", "Paper Code", "Paper", "PaperNo", "Paper No", "Code"]));
                    const paperTitle = asAnyPlain(findPropValue(props, ["PaperTitle", "Paper Title", "Title"])) || explicitPaperCode || "Untitled Paper";

                    let paperCode = explicitPaperCode;
                    if (!paperCode) {
                        const titleKey = paperTitle.trim().toLowerCase() || "__untitled__";
                        const existingGenerated = generatedCodeByTitleKey.get(titleKey);
                        if (existingGenerated) {
                            paperCode = existingGenerated;
                        } else {
                            paperCode = makeUniquePaperCode(paperTitle, usedPaperCodes);
                            generatedCodeByTitleKey.set(titleKey, paperCode);
                        }
                    }
                    usedPaperCodes.add(paperCode);

                    const sectionTitle = asAnyPlain(findPropValue(props, ["SectionTitle", "Section Title"])) || sectionCodeRaw;
                    const markingSchemeName = asAnyPlain(findPropValue(props, ["MarkingSchemeName", "Marking Scheme", "Scheme"])) || undefined;
                    const instructions = asAnyPlain(findPropValue(props, ["InstructionsRichText", "Instructions"]));

                    rows.push({
                        paperCode,
                        paperTitle,
                        durationMinutes: duration,
                        instructionsRichText: instructions,
                        isActive,
                        subject: subjectEnum(subjectRaw),
                        sectionCode: sectionCodeRaw,
                        sectionTitle,
                        questionType: qType,
                        stemRich: stemRichRaw,
                        stemAssets: undefined,
                        payload,
                        qNo,
                        options,
                        matchItems: undefined,
                        markingSchemeName,
                    });
                }
            }
        }

        if (!resp.has_more) break;
        cursor = resp.next_cursor ?? undefined;
    }

    if (papers.length === 0 && rows.length > 0) {
        papers.push(...rowsToPapers(rows));
    }

    if (papers.length === 0) {
        const observed = Array.from(observedTextProps).sort();
        const observedMsg = observed.length
            ? ` Observed non-empty text/title properties: ${observed.join(", ")}.`
            : "";
        throw new Error(
            `No parsable paper JSON found in Notion DB. Add JSON in any rich_text/title column (recommended names: ${NOTION_JSON_FIELDS.join(", ")}).${observedMsg}`,
        );
    }

    const byCode = new Map<string, PaperInput>();
    for (const paper of papers) {
        byCode.set(paper.code, paper);
    }

    return Array.from(byCode.values());
}

async function loadPapersFromTemplateFile(): Promise<PaperInput[]> {
    const raw = await readFile(DEFAULT_TEMPLATE_PATH, "utf8");
    const parsed = JSON.parse(raw) as PaperSet;
    if (!Array.isArray(parsed.papers) || parsed.papers.length === 0) {
        throw new Error("Template JSON must contain a non-empty papers array");
    }
    return parsed.papers;
}

function collectMarkingSchemeNames(papers: PaperInput[]): string[] {
    const names = new Set<string>();
    for (const paper of papers) {
        for (const subject of paper.subjects ?? []) {
            for (const section of subject.sections ?? []) {
                for (const block of section.blocks ?? []) {
                    for (const question of block.questions ?? []) {
                        if (question.markingSchemeName) names.add(question.markingSchemeName);
                    }
                }
            }
        }
    }
    return Array.from(names);
}

async function ensureSchemes(requiredSchemeNames: string[]) {
    const rows = await prisma.examV2MarkingScheme.findMany({
        where: { name: { in: requiredSchemeNames } },
        select: { id: true, name: true },
    });

    const schemeByName = new Map(rows.map((r) => [r.name, r.id] as const));
    for (const key of requiredSchemeNames) {
        if (!schemeByName.has(key)) {
            throw new Error(`Missing marking scheme: ${key}. Run npm run db:seed first.`);
        }
    }

    return schemeByName;
}

async function upsertPaper(
    paper: PaperInput,
    schemeByName: Map<string, string>,
): Promise<{ id: string; code: string }> {
    const asNullableJson = (
        value: unknown,
    ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput =>
        value == null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);

    return prisma.$transaction(async (tx) => {
        const existing = await tx.examV2.findUnique({
            where: { code: paper.code },
            select: { id: true, _count: { select: { attempts: true } } },
        });

        let examId: string;
        if (!existing) {
            const created = await tx.examV2.create({
                data: {
                    code: paper.code,
                    title: paper.title,
                    durationMinutes: paper.durationMinutes,
                    instructionsRichText: paper.instructionsRichText ?? null,
                    isActive: paper.isActive ?? true,
                },
                select: { id: true },
            });
            examId = created.id;
        } else {
            if (existing._count.attempts > 0) {
                throw new Error(
                    `Cannot rebuild ${paper.code} because it already has ${existing._count.attempts} attempt(s).`,
                );
            }

            await tx.examV2Subject.deleteMany({ where: { examId: existing.id } });

            const updated = await tx.examV2.update({
                where: { id: existing.id },
                data: {
                    title: paper.title,
                    durationMinutes: paper.durationMinutes,
                    instructionsRichText: paper.instructionsRichText ?? null,
                    isActive: paper.isActive ?? true,
                },
                select: { id: true },
            });
            examId = updated.id;
        }

        for (const [subjectIndex, subject] of paper.subjects.entries()) {
            const examSubject = await tx.examV2Subject.create({
                data: {
                    examId,
                    subject: subject.subject,
                    sortOrder: subjectIndex,
                },
                select: { id: true },
            });

            for (const [sectionIndex, section] of subject.sections.entries()) {
                const createdSection = await tx.examV2Section.create({
                    data: {
                        examSubjectId: examSubject.id,
                        sectionCode: section.sectionCode,
                        title: section.title,
                        instructionsRich: section.instructionsRich ?? null,
                        sortOrder: sectionIndex,
                        config: asNullableJson(section.config),
                    },
                    select: { id: true },
                });

                for (const [blockIndex, block] of section.blocks.entries()) {
                    const createdBlock = await tx.examV2Block.create({
                        data: {
                            sectionId: createdSection.id,
                            blockType: block.blockType,
                            sortOrder: blockIndex,
                            paragraphRich: block.paragraphRich ?? null,
                            paragraphAssets: asNullableJson(block.paragraphAssets),
                        },
                        select: { id: true },
                    });

                    for (const question of block.questions) {
                        const createdQuestion = await tx.examV2Question.create({
                            data: {
                                blockId: createdBlock.id,
                                questionType: question.questionType,
                                stemRich: question.stemRich,
                                stemAssets: asNullableJson(question.stemAssets),
                                payload: asNullableJson(question.payload),
                                difficultyRank: question.difficultyRank ?? null,
                                marksSchemeId: question.markingSchemeName
                                    ? (schemeByName.get(question.markingSchemeName) ?? null)
                                    : null,
                            },
                            select: { id: true },
                        });

                        if (question.options?.length) {
                            await tx.examV2QuestionOption.createMany({
                                data: question.options.map((opt, optionIndex) => ({
                                    questionId: createdQuestion.id,
                                    optionKey: opt.optionKey,
                                    labelRich: opt.labelRich,
                                    assets: asNullableJson(opt.assets),
                                    sortOrder: optionIndex,
                                    isCorrect: typeof opt.isCorrect === "boolean" ? opt.isCorrect : null,
                                })),
                            });
                        }

                        if (question.matchItems?.length) {
                            await tx.examV2QuestionMatchItem.createMany({
                                data: question.matchItems.map((item, itemIndex) => ({
                                    questionId: createdQuestion.id,
                                    listName: item.listName,
                                    itemKey: item.itemKey,
                                    labelRich: item.labelRich,
                                    sortOrder: itemIndex,
                                })),
                            });
                        }
                    }
                }
            }
        }

        return { id: examId, code: paper.code };
    });
}

async function main() {
    const papers = process.env.NOTION_DATABASE_ID && process.env.NOTION_TOKEN
        ? await loadPapersFromNotion()
        : await loadPapersFromTemplateFile();

    if (papers.length === 0) {
        throw new Error("No papers found to seed");
    }

    if (papers.length < 2) {
        console.warn(
            `Only ${papers.length} paper found from source. Seeding available paper(s): ${papers.map((p) => p.code).join(", ")}`,
        );
    }

    papers.forEach((paper, index) => validatePaper(paper, index));

    const requiredSchemeNames = collectMarkingSchemeNames(papers);
    const schemeByName = await ensureSchemes(requiredSchemeNames);

    for (const paper of papers) {
        const created = await upsertPaper(paper, schemeByName);
        console.log(`Upserted ${created.code} (${created.id})`);
    }

    const source = process.env.NOTION_DATABASE_ID && process.env.NOTION_TOKEN
        ? "Notion"
        : "local template";
    console.log(`Done seeding v2 papers from ${source}.`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
