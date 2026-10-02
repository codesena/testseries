"use client";

import { MathJax } from "better-react-mathjax";
import { normalizeLatexSource } from "@/lib/latex";
import { optimizeImageDelivery } from "@/lib/image-delivery";

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
        <div className={`leading-relaxed ${className}`}>
            {urls.length ? (
                <div className={`mb-3 grid gap-2 ${urls.length > 1 ? "sm:grid-cols-2" : ""}`}>
                    {urls.map((url) => (
                        <div key={url} className="rounded border p-2 flex items-center justify-center min-h-28" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={optimizeImageDelivery(url)} alt="Question" className="max-w-full max-h-72 object-contain" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                        </div>
                    ))}
                </div>
            ) : null}
            <MathText text={text} />
        </div>
    );
}

export function OptionContent({ text, imageUrls = [], className = "" }: { text: string; imageUrls?: string[]; className?: string }) {
    const urls = imageUrls.map((url) => url.trim()).filter(Boolean);
    return (
        <div className={`min-w-0 ${className}`}>
            <MathText text={text} />
            {urls.length ? (
                <div className={`mt-2 grid gap-2 ${urls.length > 1 ? "sm:grid-cols-2" : ""}`}>
                    {urls.map((url) => (
                        <div key={url} className="rounded border p-2 flex items-center justify-center min-h-20" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={optimizeImageDelivery(url)} alt="Option" className="max-w-full max-h-56 object-contain" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
