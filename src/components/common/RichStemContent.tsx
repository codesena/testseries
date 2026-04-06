"use client";

import { MathJax } from "better-react-mathjax";
import { optimizeImageDelivery } from "@/lib/image-delivery";

type ParsedPipeTable = {
    headers: string[];
    rows: string[][];
};

type StemBlock =
    | { kind: "text"; text: string }
    | { kind: "table"; table: ParsedPipeTable };

type CellSegment =
    | { kind: "text"; text: string }
    | { kind: "image"; alt: string; url: string };

function sanitizeRenderableText(input: string): string {
    return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

function parsePipeRow(line: string): string[] | null {
    if (!line.includes("|")) return null;
    const raw = line.trim();
    if (!raw) return null;

    const trimmed = raw.replace(/^\|/, "").replace(/\|$/, "");
    const cells = trimmed.split("|").map((c) => c.trim());
    return cells.length ? cells : null;
}

function isPipeSeparatorRow(cells: string[]): boolean {
    return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}

function parseStemBlocksWithPipeTables(stem: string): StemBlock[] {
    const lines = stem.split(/\r?\n/);
    const blocks: StemBlock[] = [];
    const textBuffer: string[] = [];

    const flushText = () => {
        const text = textBuffer.join("\n").trim();
        if (text) blocks.push({ kind: "text", text });
        textBuffer.length = 0;
    };

    let i = 0;
    while (i < lines.length) {
        const head = parsePipeRow(lines[i]);
        const sep = i + 1 < lines.length ? parsePipeRow(lines[i + 1]) : null;

        if (head && sep && head.length === sep.length && isPipeSeparatorRow(sep)) {
            flushText();
            i += 2;
            const rows: string[][] = [];
            while (i < lines.length) {
                const row = parsePipeRow(lines[i]);
                if (!row) break;
                rows.push(row);
                i += 1;
            }
            blocks.push({ kind: "table", table: { headers: head, rows } });
            continue;
        }

        textBuffer.push(lines[i]);
        i += 1;
    }

    flushText();
    return blocks;
}

function parseCellSegments(cell: string): CellSegment[] {
    const out: CellSegment[] = [];
    const markdownImagePattern = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
    const urlPattern = /(https?:\/\/[^\s)]+)/g;

    const pushTextWithUrlImages = (text: string) => {
        let urlLast = 0;
        let urlMatch: RegExpExecArray | null = null;
        while ((urlMatch = urlPattern.exec(text)) !== null) {
            const url = urlMatch[1];
            const start = urlMatch.index;
            if (start > urlLast) {
                out.push({ kind: "text", text: text.slice(urlLast, start) });
            }
            out.push({ kind: "image", alt: "Cell image", url });
            urlLast = start + url.length;
        }

        if (urlLast < text.length) {
            out.push({ kind: "text", text: text.slice(urlLast) });
        }
    };

    let last = 0;
    let match: RegExpExecArray | null = null;
    while ((match = markdownImagePattern.exec(cell)) !== null) {
        const [full, alt, url] = match;
        const start = match.index;
        if (start > last) {
            pushTextWithUrlImages(cell.slice(last, start));
        }
        out.push({ kind: "image", alt: alt || "Cell image", url });
        last = start + full.length;
    }

    if (last < cell.length) {
        pushTextWithUrlImages(cell.slice(last));
    }

    return out.length ? out : [{ kind: "text", text: cell }];
}

export function RichStemContent({ text }: { text: string }) {
    const blocks = parseStemBlocksWithPipeTables(text);

    return (
        <div className="space-y-3">
            {blocks.map((block, idx) => (
                block.kind === "text" ? (
                    <div key={`stem-text-${idx}`} className="space-y-2">
                        {parseCellSegments(block.text).map((segment, sIdx) => (
                            segment.kind === "text" ? (
                                <MathJax key={`stem-text-seg-${idx}-${sIdx}`} dynamic>{sanitizeRenderableText(segment.text)}</MathJax>
                            ) : (
                                <div key={`stem-img-seg-${idx}-${sIdx}`} className="rounded border p-1.5 inline-block" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={optimizeImageDelivery(segment.url)} alt={segment.alt} className="max-h-56 w-auto object-contain" />
                                </div>
                            )
                        ))}
                    </div>
                ) : (
                    <div key={`stem-table-${idx}`} className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
                        <table className="w-full min-w-[540px] border-collapse text-sm sm:text-base">
                            <thead>
                                <tr style={{ background: "var(--muted)" }}>
                                    {block.table.headers.map((h, hIdx) => (
                                        <th key={`h-${hIdx}`} className="border px-3 py-2 text-left font-semibold" style={{ borderColor: "var(--border)" }}>
                                            <MathJax dynamic>{sanitizeRenderableText(h)}</MathJax>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {block.table.rows.map((row, rIdx) => (
                                    <tr key={`r-${rIdx}`}>
                                        {row.map((cell, cIdx) => {
                                            const segments = parseCellSegments(cell);
                                            return (
                                                <td key={`c-${rIdx}-${cIdx}`} className="align-top border px-3 py-2" style={{ borderColor: "var(--border)" }}>
                                                    <div className="space-y-2">
                                                        {segments.map((segment, sIdx) => (
                                                            segment.kind === "text" ? (
                                                                <MathJax key={`t-${sIdx}`} dynamic>{sanitizeRenderableText(segment.text)}</MathJax>
                                                            ) : (
                                                                <div key={`i-${sIdx}`} className="rounded border p-1.5" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                    <img src={optimizeImageDelivery(segment.url)} alt={segment.alt} className="max-h-48 w-auto object-contain" />
                                                                </div>
                                                            )
                                                        ))}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )
            ))}
        </div>
    );
}
