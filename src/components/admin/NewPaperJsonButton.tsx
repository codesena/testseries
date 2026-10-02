"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PaperJsonEditor } from "./PaperJsonEditor";

const mainsTemplate = { title: "New Main Paper", totalDurationMinutes: 180, isAdvancedFormat: false, questions: [] };
const advancedTemplate = { code: "NEW-PAPER", title: "New Advanced Paper", durationMinutes: 180, isActive: true, subjects: ["PHYSICS", "CHEMISTRY", "MATHEMATICS"].map((subject) => ({ subject, sections: [{ sectionCode: "A", title: "Section A", blocks: [{ blockType: "QUESTION", questions: [] }] }] })) };

export function NewPaperJsonButton() {
    const router = useRouter();
    const [kind, setKind] = useState<"main" | "advanced" | null>(null);
    return (
        <>
            <div className="flex flex-wrap gap-2">
                <button type="button" className="rounded-full border px-3 py-2 text-xs ui-click" style={{ borderColor: "var(--border)", background: "var(--muted)" }} onClick={() => setKind("main")}>New Main paper JSON</button>
                <button type="button" className="rounded-full border px-3 py-2 text-xs ui-click" style={{ borderColor: "var(--border)", background: "var(--muted)" }} onClick={() => setKind("advanced")}>New Advanced paper JSON</button>
            </div>
            {kind ? <PaperJsonEditor
                endpoint={kind === "main" ? "/api/admin/tests" : "/api/v2/admin/exams"}
                method="POST"
                initialJson={kind === "main" ? mainsTemplate : advancedTemplate}
                open
                onClose={() => setKind(null)}
                onSaved={(data) => {
                    const id = (data as { testId?: string; examId?: string })?.testId ?? (data as { examId?: string })?.examId;
                    if (id) router.push(kind === "main" ? `/admin/paper/${id}` : `/admin/paper/advance/${id}`);
                }}
            /> : null}
        </>
    );
}
