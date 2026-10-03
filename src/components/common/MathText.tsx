"use client";

import { MathJax } from "better-react-mathjax";
import { normalizeLatexSource } from "@/lib/latex";
import { MediaImageGroup, QuestionMediaLayout } from "@/components/common/QuestionMediaLayout";

type Segment = { kind: "text" | "math"; value: string; display?: boolean };

function splitSegments(value: string): Segment[] {
    const text = normalizeLatexSource(value).replace(/<br\s*\/?\s*>/gi, "\n");
    const pattern = /(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g;
    const segments: Segment[] = [];
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
        if (match.index > last) segments.push({ kind: "text", value: text.slice(last, match.index) });
        const token = match[0];
        const display = token.startsWith("$$") || token.startsWith("\\[");
        const value = display
            ? token.slice(2, -2)
            : token.startsWith("$")
                ? token.slice(1, -1)
                : token.slice(2, -2);
        segments.push({ kind: "math", value, display });
        last = match.index + token.length;
    }
    if (!segments.length && last === 0 && text.trimStart().startsWith("$")) {
        const start = text.indexOf("$");
        return [{ kind: "math", value: text.slice(start + 1).trim(), display: false }];
    }
    if (last < text.length) segments.push({ kind: "text", value: text.slice(last) });
    return segments.length ? segments : [{ kind: "text", value: "" }];
}

export function MathText({ text, className = "" }: { text: string; className?: string }) {
    const lines = normalizeLatexSource(text).replace(/<br\s*\/?\s*>/gi, "\n").split(/\r?\n/);
    return (
        <div className={`space-y-1 ${className}`}>
            {lines.map((line, lineIndex) => (
                <div key={`math-line-${lineIndex}`} className={line ? undefined : "min-h-[1em]"}>
                    {splitSegments(line).map((segment, index) =>
                        segment.kind === "math" ? (
                            <MathJax key={`math-segment-${lineIndex}-${index}`} inline dynamic>
                                {`$${segment.value || "\\,\u00a0"}$`}
                            </MathJax>
                        ) : (
                            <span key={`text-segment-${lineIndex}-${index}`} className="whitespace-pre-wrap">{segment.value || "\u00a0"}</span>
                        ),
                    )}
                </div>
            ))}
        </div>
    );
}

export function QuestionContent({
    text,
    imageUrls = [],
    className = "",
}: {
    text: string;
    imageUrls?: string[];
    className?: string;
}) {
    const urls = imageUrls.map((url) => url.trim()).filter(Boolean);
    return (
        <QuestionMediaLayout
            imageUrls={urls}
            altBase="Question image"
            hasText={Boolean(text.trim())}
            className={`leading-relaxed ${className}`.trim()}
        >
            <MathText text={text} />
        </QuestionMediaLayout>
    );
}

export function OptionContent({ text, imageUrls = [], className = "" }: { text: string; imageUrls?: string[]; className?: string }) {
    const urls = imageUrls.map((url) => url.trim()).filter(Boolean);
    return (
        <div className={`min-w-0 ${className}`}>
            <MathText text={text} />
            {urls.length ? (
                <MediaImageGroup
                    imageUrls={urls}
                    altBase="Option image"
                    variant="option"
                    maxImageHeight={320}
                    className="mt-2"
                />
            ) : null}
        </div>
    );
}
