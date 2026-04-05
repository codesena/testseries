import { normalizeInstructionForDisplay } from "@/lib/instructions";
import type { ReactNode } from "react";

type InstructionBlock =
    | { type: "center-heading"; text: string }
    | { type: "heading"; text: string }
    | { type: "paragraph"; text: string }
    | { type: "list"; items: string[] }
    | { type: "spacer" };

function cleanHeadingText(line: string) {
    return line.replace(/:\s*$/, "").trim();
}

function detectHeading(line: string): InstructionBlock | null {
    const text = cleanHeadingText(line);
    if (!text) return null;

    const upper = text.toUpperCase();
    if (upper === "MARKING SCHEME") {
        return { type: "center-heading", text };
    }

    if (upper === "GENERAL INSTRUCTIONS" || upper === "PAPER NOTES") {
        return { type: "heading", text };
    }

    // Generic uppercase headline line from pasted PDFs.
    if (/^[A-Z0-9 ()&+\-]+$/.test(text) && text.length <= 56 && /[A-Z]/.test(text)) {
        return { type: "heading", text };
    }

    return null;
}

function isBulletLine(line: string) {
    return /^\s*[•\-*]\s+/.test(line);
}

function stripBulletPrefix(line: string) {
    return line.replace(/^\s*[•\-*]\s+/, "").trim();
}

function renderHighlightedText(text: string): ReactNode[] {
    const rules: RegExp[] = [
        /(ONLY\s+ONE|ONE\s+OR\s+MORE\s+THAN\s+ONE|NON-NEGATIVE\s+INTEGER\s+VALUE|THREE\s+PARTS|TWO\s+SECTIONS)/gi,
        /(PART-?I+|PART-?II+|PART-?III+)/gi,
        /(FULL\s+MARKS|ZERO\s+MARKS|NEGATIVE\s+MARKS|PARTIAL\s+MARKS)/gi,
    ];

    let segments: Array<{ text: string; strong: boolean }> = [{ text, strong: false }];

    for (const rule of rules) {
        const next: Array<{ text: string; strong: boolean }> = [];
        for (const segment of segments) {
            if (segment.strong) {
                next.push(segment);
                continue;
            }

            let last = 0;
            rule.lastIndex = 0;
            let match = rule.exec(segment.text);
            if (!match) {
                next.push(segment);
                continue;
            }

            while (match) {
                const start = match.index;
                const end = start + match[0].length;

                if (start > last) {
                    next.push({ text: segment.text.slice(last, start), strong: false });
                }
                next.push({ text: segment.text.slice(start, end), strong: true });
                last = end;
                match = rule.exec(segment.text);
            }

            if (last < segment.text.length) {
                next.push({ text: segment.text.slice(last), strong: false });
            }
        }

        segments = next;
    }

    return segments.map((segment, index) => (
        segment.strong ? <strong key={`hl-${index}`}>{segment.text}</strong> : <span key={`hl-${index}`}>{segment.text}</span>
    ));
}

function renderInstructionLine(text: string): ReactNode {
    const sectionLead = text.match(/^(Section\s*-\s*[A-Z]+(?:\s*\([^)]*\))?\s*:)(.*)$/i);
    if (sectionLead) {
        return (
            <>
                <strong>{sectionLead[1]}</strong>
                {" "}
                {renderHighlightedText(sectionLead[2].trim())}
            </>
        );
    }

    const marksLead = text.match(/^((?:Full|Zero|Negative|Partial)\s*Marks\s*:)(.*)$/i);
    if (marksLead) {
        return (
            <>
                <strong>{marksLead[1]}</strong>
                {" "}
                {renderHighlightedText(marksLead[2].trim())}
            </>
        );
    }

    return <>{renderHighlightedText(text)}</>;
}

function toBlocks(raw: string): InstructionBlock[] {
    const normalized = normalizeInstructionForDisplay(raw);
    const lines = normalized.split("\n");

    const blocks: InstructionBlock[] = [];
    let listBuffer: string[] = [];

    const flushList = () => {
        if (listBuffer.length) {
            blocks.push({ type: "list", items: listBuffer });
            listBuffer = [];
        }
    };

    for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed) {
            flushList();
            if (blocks.length && blocks[blocks.length - 1].type !== "spacer") {
                blocks.push({ type: "spacer" });
            }
            continue;
        }

        if (isBulletLine(trimmed)) {
            listBuffer.push(stripBulletPrefix(trimmed));
            continue;
        }

        flushList();

        const heading = detectHeading(trimmed);
        if (heading) {
            blocks.push(heading);
            continue;
        }

        blocks.push({ type: "paragraph", text: trimmed });
    }

    flushList();
    return blocks;
}

export function InstructionRichText({
    text,
    className,
}: {
    text: string;
    className?: string;
}) {
    const blocks = toBlocks(text);

    return (
        <div className={className}>
            {blocks.map((block, idx) => {
                if (block.type === "spacer") {
                    return <div key={`spacer-${idx}`} className="h-2" />;
                }

                if (block.type === "center-heading") {
                    return (
                        <div key={`center-heading-${idx}`} className="text-center font-semibold tracking-wide uppercase">
                            {block.text}
                        </div>
                    );
                }

                if (block.type === "heading") {
                    return (
                        <div key={`heading-${idx}`} className="font-semibold">
                            {block.text}
                        </div>
                    );
                }

                if (block.type === "list") {
                    return (
                        <ul key={`list-${idx}`} className="list-disc pl-5 space-y-1">
                            {block.items.map((item, itemIdx) => (
                                <li key={`list-${idx}-item-${itemIdx}`}>{renderInstructionLine(item)}</li>
                            ))}
                        </ul>
                    );
                }

                return (
                    <p key={`para-${idx}`} className="leading-relaxed">
                        {renderInstructionLine(block.text)}
                    </p>
                );
            })}
        </div>
    );
}
