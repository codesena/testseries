import "dotenv/config";
import { Client } from "@notionhq/client";

function normalizeNotionId(id: string) {
    return id.replace(/-/g, "").trim();
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

function asAnyPlain(prop: any): string {
    return asRichTextPlain(prop) || asTitlePlain(prop) || asSelectPlain(prop);
}

function findPropValue(props: Record<string, unknown>, names: string[]): unknown {
    for (const name of names) {
        const v = getProp(props, name);
        if (v != null) return v;
    }
    return undefined;
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
            throw new Error("Given id is neither database id nor a page with child databases");
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

async function main() {
    const token = process.env.NOTION_TOKEN?.trim();
    const idOrPage = process.env.NOTION_DATABASE_ID?.trim();

    if (!token) throw new Error("NOTION_TOKEN missing");
    if (!idOrPage) throw new Error("NOTION_DATABASE_ID missing");

    const notion = new Client({ auth: token });
    const dbId = await resolveDatabaseId(notion, idOrPage);

    console.log("Resolved database id:", dbId);

    let cursor: string | undefined = undefined;
    let pageCount = 0;
    const rows: Array<{
        notionPageId: string;
        paperCode: string;
        missingPaperCode: boolean;
        paperTitle: string;
        subject: string;
        sectionCode: string;
        questionType: string;
        hasStem: boolean;
        propertyNames: string[];
    }> = [];

    for (; ;) {
        const resp = await notion.databases.query({
            database_id: dbId,
            start_cursor: cursor,
            page_size: 100,
        });

        pageCount += resp.results.length;

        for (const page of resp.results as any[]) {
            if (page?.object !== "page") continue;
            const props = (page.properties ?? {}) as Record<string, unknown>;

            const explicitPaperCode = asAnyPlain(findPropValue(props, ["PaperCode", "Paper Code", "Paper", "PaperNo", "Paper No", "Code"]));
            const paperCode = explicitPaperCode || "<MISSING_PAPER_CODE>";
            const paperTitle = asAnyPlain(findPropValue(props, ["PaperTitle", "Paper Title", "Title"])) || paperCode;
            const subject = asAnyPlain(findPropValue(props, ["Subject"]));
            const sectionCode = asAnyPlain(findPropValue(props, ["SectionCode", "Section Code"]));
            const questionType = asAnyPlain(findPropValue(props, ["QuestionType", "Question Type", "Type"]));
            const stemRichRaw = asAnyPlain(findPropValue(props, ["StemRich", "Question", "Stem"]));

            rows.push({
                notionPageId: String(page.id),
                paperCode,
                missingPaperCode: !explicitPaperCode,
                paperTitle,
                subject,
                sectionCode,
                questionType,
                hasStem: Boolean(stemRichRaw),
                propertyNames: Object.keys(props),
            });
        }

        if (!resp.has_more) break;
        cursor = resp.next_cursor ?? undefined;
    }

    const byPaper = new Map<string, number>();
    for (const row of rows) {
        byPaper.set(row.paperCode, (byPaper.get(row.paperCode) ?? 0) + 1);
    }

    const missingCore = rows.filter((r) => !(r.subject && r.sectionCode && r.questionType && r.hasStem));
    const missingPaperCodeRows = rows.filter((r) => r.missingPaperCode);

    console.log("Total pages from Notion query:", pageCount);
    console.log("Rows parsed:", rows.length);
    console.log("Paper code distribution:", Object.fromEntries(byPaper));
    console.log("Rows missing PaperCode:", missingPaperCodeRows.length);
    console.log("Rows missing Subject/SectionCode/QuestionType/StemRich:", missingCore.length);

    const sample = rows.slice(0, 8).map((r) => ({
        notionPageId: r.notionPageId,
        paperCode: r.paperCode,
        paperTitle: r.paperTitle,
        subject: r.subject,
        sectionCode: r.sectionCode,
        questionType: r.questionType,
        hasStem: r.hasStem,
    }));

    console.log("Sample rows:");
    console.log(JSON.stringify(sample, null, 2));

    if (missingPaperCodeRows.length) {
        console.log("Rows with missing PaperCode (first 10 page ids):");
        console.log(missingPaperCodeRows.slice(0, 10).map((r) => r.notionPageId).join(", "));
    }

    if (rows[0]) {
        console.log("Property names in first row:", rows[0].propertyNames.join(", "));
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
