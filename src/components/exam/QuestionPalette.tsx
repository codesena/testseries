"use client";

import type { AttemptQuestion } from "@/lib/types";
import type { PaletteStatus } from "@/components/exam/palette";

function paletteClass(status: PaletteStatus) {
    switch (status) {
        case "NOT_VISITED":
            return "bg-gray-100 text-gray-900";
        case "VISITED_NOT_ANSWERED":
            return "bg-orange-100 text-orange-900";
        case "ANSWERED_SAVED":
            return "bg-green-100 text-green-900";
        case "MARKED_FOR_REVIEW":
            return "bg-purple-100 text-purple-900";
        case "ANSWERED_MARKED_FOR_REVIEW":
            return "bg-purple-200 text-purple-900";
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
                        )} ${active ? "ring-2 ring-black/50" : ""}`}
                        style={{ borderColor: "var(--border)" }}
                        title={`${idx + 1}`}
                    >
                        <span className="relative">
                            {idx + 1}
                            {status === "ANSWERED_MARKED_FOR_REVIEW" ? (
                                <span className="absolute -top-2 -right-2 text-[10px]">✓</span>
                            ) : null}
                        </span>
                    </button>
                );
            })}

            <div className="col-span-6 mt-4 text-xs opacity-70">
                <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded bg-gray-100 border" /> Not visited
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded bg-orange-100 border" /> Visited
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded bg-green-100 border" /> Answered
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded bg-purple-100 border" /> Marked
                    </div>
                </div>
            </div>
        </div>
    );
}
