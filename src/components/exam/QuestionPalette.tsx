"use client";

import type { AttemptQuestion } from "@/lib/types";
import type { PaletteStatus } from "@/components/exam/palette";

function paletteClass(status: PaletteStatus) {
    switch (status) {
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

function paletteBadge(status: PaletteStatus) {
    switch (status) {
        case "ANSWERED_SAVED":
            return "✓";
        case "MARKED_FOR_REVIEW":
            return "R";
        case "ANSWERED_MARKED_FOR_REVIEW":
            return "✓R";
        default:
            return null;
    }
}

export function QuestionPalette({
    questions,
    paletteByQid,
    activeQuestionId,
    onPick,
}: {
    questions: AttemptQuestion[];
    paletteByQid: Record<string, PaletteStatus>;
    activeQuestionId: string | null;
    onPick: (questionId: string) => void;
}) {
    return (
        <div className="grid grid-cols-6 gap-2">
            {questions.map((q, idx) => {
                const status = paletteByQid[q.id] ?? "NOT_VISITED";
                const active = q.id === activeQuestionId;
                return (
                    <button
                        key={q.id}
                        type="button"
                        onClick={() => onPick(q.id)}
                        className={`rounded border aspect-square text-sm flex items-center justify-center ${paletteClass(
                            status,
                        )} ${active ? "ring-2 ring-black/50 dark:ring-white/40" : ""}`}
                        style={{ borderColor: "var(--border)" }}
                        title={`${idx + 1}`}
                    >
                        <span className="relative">
                            {idx + 1}
                            {paletteBadge(status) ? (
                                <span className="absolute -top-2 -right-2 text-[10px] font-semibold">
                                    {paletteBadge(status)}
                                </span>
                            ) : null}
                        </span>
                    </button>
                );
            })}

            <div className="col-span-6 mt-4 text-xs opacity-70">
                <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2">
                        <span
                            className="inline-block w-3 h-3 rounded border"
                            style={{ background: "var(--muted)", borderColor: "var(--border)" }}
                        />
                        Not visited
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded bg-amber-300 border" /> Visited
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded bg-emerald-400 border" /> Answered
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded bg-violet-400 border" /> Marked
                    </div>
                </div>
            </div>
        </div>
    );
}
