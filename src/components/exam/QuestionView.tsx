"use client";

import { MathJax } from "better-react-mathjax";
import type { AttemptQuestion } from "@/lib/types";
import type { PaletteStatus } from "@/components/exam/palette";

function statusLabel(s: PaletteStatus) {
    switch (s) {
        case "NOT_VISITED":
            return "Not visited";
        case "VISITED_NOT_ANSWERED":
            return "Visited";
        case "ANSWERED_SAVED":
            return "Answered";
        case "MARKED_FOR_REVIEW":
            return "Marked";
        case "ANSWERED_MARKED_FOR_REVIEW":
            return "Answered + Marked";
    }
}

function statusBadgeClass(s: PaletteStatus) {
    switch (s) {
        case "NOT_VISITED":
            return "bg-[var(--muted)] text-[var(--foreground)]";
        case "VISITED_NOT_ANSWERED":
            return "bg-amber-300 text-amber-950";
        case "ANSWERED_SAVED":
            return "bg-emerald-400 text-emerald-950";
        case "MARKED_FOR_REVIEW":
            return "bg-violet-400 text-violet-950";
        case "ANSWERED_MARKED_FOR_REVIEW":
            return "bg-violet-700 text-white";
    }
}

export function QuestionView({
    question,
    answer,
    paletteStatus,
    onSetAnswer,
    onClear,
}: {
    question: AttemptQuestion;
    answer: unknown;
    paletteStatus: PaletteStatus;
    onSetAnswer: (value: unknown) => void;
    onClear: () => void;
}) {
    const scheme = question.markingSchemeType;
    const selectedSingle = typeof answer === "string" ? answer : null;
    const selectedMulti = Array.isArray(answer) ? new Set(answer.map(String)) : new Set<string>();
    const numericValue =
        typeof answer === "number" ? String(answer) : typeof answer === "string" ? answer : "";

    return (
        <div
            className="rounded-lg border p-4"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}
        >
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="text-xs opacity-70">
                        {question.subject.name} · {question.topicName}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                        <div className="text-xs opacity-70">Status</div>
                        <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(
                                paletteStatus,
                            )}`}
                        >
                            {statusLabel(paletteStatus)}
                        </span>
                    </div>
                </div>
                <button
                    className="text-sm underline opacity-80 hover:opacity-100 ui-click"
                    onClick={onClear}
                    type="button"
                >
                    Clear
                </button>
            </div>

            <div className="mt-4 text-base leading-relaxed">
                {question.imageUrls?.length ? (
                    <div className="mb-3 grid gap-2">
                        {question.imageUrls.map((url) => (
                            <div
                                key={url}
                                className="rounded border p-2"
                                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={url}
                                    alt="Question"
                                    className="max-w-full h-auto"
                                />
                            </div>
                        ))}
                    </div>
                ) : null}
                <MathJax dynamic>{question.questionText}</MathJax>
            </div>

            <div className="mt-5 grid gap-2">
                {scheme === "MAINS_NUMERICAL" || scheme === "ADV_NAT" ? (
                    <label
                        className="rounded border p-3 ui-click"
                        style={{ borderColor: "var(--border)", background: "var(--card)" }}
                    >
                        <div className="text-xs opacity-70">Enter numerical answer</div>
                        <input
                            className="mt-2 w-full rounded border px-3 py-2 bg-transparent ui-field"
                            style={{ borderColor: "var(--border)" }}
                            inputMode="decimal"
                            value={numericValue}
                            onChange={(e) => onSetAnswer(e.target.value)}
                            placeholder="e.g. 12 or 3.5"
                        />
                    </label>
                ) : (
                    question.options.map((o) => {
                        const checked =
                            scheme === "ADV_MULTI_CORRECT"
                                ? selectedMulti.has(o.key)
                                : selectedSingle === o.key;

                        return (
                            <label
                                key={o.key}
                                className={`rounded border p-3 cursor-pointer ui-click ${checked ? "bg-[var(--muted)]" : "bg-transparent"
                                    }`}
                                style={{ borderColor: "var(--border)" }}
                            >
                                <div className="flex items-start gap-3">
                                    <input
                                        type={scheme === "ADV_MULTI_CORRECT" ? "checkbox" : "radio"}
                                        name={scheme === "ADV_MULTI_CORRECT" ? undefined : "opt"}
                                        className="mt-1"
                                        checked={checked}
                                        onChange={() => {
                                            if (scheme === "ADV_MULTI_CORRECT") {
                                                const next = new Set(selectedMulti);
                                                if (next.has(o.key)) next.delete(o.key);
                                                else next.add(o.key);
                                                onSetAnswer(Array.from(next).sort());
                                            } else {
                                                onSetAnswer(o.key);
                                            }
                                        }}
                                    />
                                    <div className="min-w-0">
                                        <div className="text-xs opacity-70">
                                            ({o.key})
                                        </div>
                                        {o.text ? (
                                            <div className="text-sm">
                                                <MathJax dynamic>{o.text}</MathJax>
                                            </div>
                                        ) : null}

                                        {o.imageUrl ? (
                                            <div
                                                className="mt-2 rounded border p-2"
                                                style={{
                                                    borderColor: "var(--border)",
                                                    background: "var(--card)",
                                                }}
                                            >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={o.imageUrl}
                                                    alt={`Option ${o.key}`}
                                                    className="max-w-full h-auto"
                                                />
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            </label>
                        );
                    })
                )}
            </div>
        </div>
    );
}
