"use client";

import { MathJax, MathJaxContext } from "better-react-mathjax";
import { useMemo, useState } from "react";
import { optimizeImageDelivery } from "@/lib/image-delivery";

type PaperQuestion = {
    id: string;
    index: number;
    subjectName: string;
    topicName: string;
    questionText: string;
    imageUrls: string[];
    options: Array<{ key: string; text: string; imageUrl: string | null }>;
    markingSchemeType: "MAINS_SINGLE" | "MAINS_NUMERICAL" | "ADV_MULTI_CORRECT" | "ADV_NAT";
    correctAnswer: unknown;
};

const mathjaxConfig = {
    loader: { load: ["[tex]/mhchem"] },
    tex: {
        packages: { "[+]": ["mhchem"] },
        inlineMath: [["$", "$"], ["\\(", "\\)"]],
        displayMath: [["$$", "$$"], ["\\[", "\\]"]],
    },
} as const;

function isNullLikeToken(s: string): boolean {
    const v = s.trim().toLowerCase();
    return v === "" || v === "null" || v === "none" || v === "na" || v === "n/a" || v === "-";
}

function splitUrlList(raw: string): string[] {
    return raw
        .split(/\r?\n|,|;/g)
        .map((s) => s.trim())
        .filter((s) => !isNullLikeToken(s));
}

function formatAnswer(value: unknown): string {
    if (value == null) return "-";
    if (Array.isArray(value)) return value.map(String).join(", ");
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function isCorrectOption(markingSchemeType: PaperQuestion["markingSchemeType"], correctAnswer: unknown, key: string): boolean {
    if (markingSchemeType === "ADV_MULTI_CORRECT") {
        return Array.isArray(correctAnswer) ? correctAnswer.map(String).includes(key) : false;
    }
    if (markingSchemeType === "MAINS_SINGLE") {
        return String(correctAnswer) === key;
    }
    return false;
}

function coerceOptions(value: unknown): Array<{ key: string; text: string; imageUrl: string | null }> {
    if (Array.isArray(value)) {
        const out: Array<{ key: string; text: string; imageUrl: string | null }> = [];
        for (const item of value) {
            if (!item || typeof item !== "object") continue;
            const k = (item as { key?: unknown }).key;
            if (typeof k !== "string") continue;
            const t = (item as { text?: unknown }).text;
            const i = (item as { imageUrl?: unknown }).imageUrl;
            out.push({ key: k, text: typeof t === "string" ? t : "", imageUrl: typeof i === "string" ? i : null });
        }
        return out;
    }

    if (value && typeof value === "object") {
        return Object.entries(value as Record<string, unknown>).map(([key, raw]) => {
            if (typeof raw === "string") return { key, text: raw, imageUrl: null as string | null };
            if (raw && typeof raw === "object") {
                const t = (raw as { text?: unknown }).text;
                const i = (raw as { imageUrl?: unknown }).imageUrl;
                return {
                    key,
                    text: typeof t === "string" ? t : "",
                    imageUrl: typeof i === "string" ? i : null,
                };
            }
            return { key, text: "", imageUrl: null as string | null };
        });
    }

    return [];
}

function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map(String).map((v) => v.trim()).filter(Boolean);
}

export function AdminPaperViewerClient({
    testTitle,
    questions,
}: {
    testTitle: string;
    questions: PaperQuestion[];
}) {
    const [viewerQuestions, setViewerQuestions] = useState<PaperQuestion[]>(questions);
    const [issueOpenForQuestionId, setIssueOpenForQuestionId] = useState<string | null>(null);
    const [editOpenForQuestionId, setEditOpenForQuestionId] = useState<string | null>(null);
    const [loadingEdit, setLoadingEdit] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    const [copyingEdit, setCopyingEdit] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);
    const [editSuccess, setEditSuccess] = useState<string | null>(null);
    const [editRaw, setEditRaw] = useState("");
    const [issue, setIssue] = useState("Wrong answer");
    const [details, setDetails] = useState("");
    const [sendingIssue, setSendingIssue] = useState(false);
    const [issueError, setIssueError] = useState<string | null>(null);
    const [issueSavedForQuestionId, setIssueSavedForQuestionId] = useState<Record<string, boolean>>({});

    const issueQuestion = useMemo(
        () => viewerQuestions.find((q) => q.id === issueOpenForQuestionId) ?? null,
        [viewerQuestions, issueOpenForQuestionId],
    );

    async function openEdit(questionId: string) {
        setEditOpenForQuestionId(questionId);
        setEditError(null);
        setEditSuccess(null);
        setEditRaw("");
        setLoadingEdit(true);

        try {
            const res = await fetch(`/api/admin/questions/${questionId}`, { cache: "no-store" });
            if (!res.ok) {
                const txt = await res.text().catch(() => "");
                throw new Error(`${res.status} ${res.statusText} ${txt}`);
            }

            const data = (await res.json()) as {
                question: {
                    subjectId: number;
                    topicName: string;
                    questionText: string;
                    imageUrls: unknown;
                    options: unknown;
                    correctAnswer: unknown;
                    markingSchemeType: "MAINS_SINGLE" | "MAINS_NUMERICAL" | "ADV_MULTI_CORRECT" | "ADV_NAT";
                    difficultyRank: number | null;
                };
            };

            setEditRaw(JSON.stringify(data.question, null, 2));
        } catch (e) {
            setEditError(e instanceof Error ? e.message : "Failed to load question for edit");
        } finally {
            setLoadingEdit(false);
        }
    }

    async function saveEdit() {
        if (!editOpenForQuestionId || savingEdit) return;

        let payload: unknown;
        try {
            payload = JSON.parse(editRaw);
        } catch {
            setEditError("Invalid JSON. Please fix the payload before saving.");
            return;
        }

        setSavingEdit(true);
        setEditError(null);
        setEditSuccess(null);

        try {
            const res = await fetch(`/api/admin/questions/${editOpenForQuestionId}`, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const txt = await res.text().catch(() => "");
                throw new Error(`${res.status} ${res.statusText} ${txt}`);
            }

            const data = (await res.json()) as {
                question: {
                    id: string;
                    topicName: string;
                    questionText: string;
                    imageUrls: unknown;
                    options: unknown;
                    correctAnswer: unknown;
                    markingSchemeType: "MAINS_SINGLE" | "MAINS_NUMERICAL" | "ADV_MULTI_CORRECT" | "ADV_NAT";
                    subjectName: string;
                };
            };

            setViewerQuestions((prev) => prev.map((q) => {
                if (q.id !== editOpenForQuestionId) return q;
                return {
                    ...q,
                    subjectName: data.question.subjectName,
                    topicName: data.question.topicName,
                    questionText: data.question.questionText,
                    imageUrls: asStringArray(data.question.imageUrls),
                    options: coerceOptions(data.question.options),
                    markingSchemeType: data.question.markingSchemeType,
                    correctAnswer: data.question.correctAnswer,
                };
            }));

            setEditSuccess("Question updated successfully.");
        } catch (e) {
            setEditError(e instanceof Error ? e.message : "Failed to save question");
        } finally {
            setSavingEdit(false);
        }
    }

    async function copyEditJson() {
        if (!editRaw.trim() || copyingEdit) return;

        setCopyingEdit(true);
        setEditError(null);
        try {
            await navigator.clipboard.writeText(editRaw);
            setEditSuccess("JSON copied to clipboard.");
        } catch {
            setEditError("Could not copy JSON. Please copy manually.");
        } finally {
            setCopyingEdit(false);
        }
    }

    async function submitIssue() {
        if (!issueQuestion || sendingIssue) return;

        const trimmedIssue = issue.trim();
        const trimmedDetails = details.trim();
        if (!trimmedIssue) {
            setIssueError("Issue title is required.");
            return;
        }

        setSendingIssue(true);
        setIssueError(null);
        try {
            const res = await fetch(`/api/admin/questions/${issueQuestion.id}/issue`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    issue: trimmedIssue,
                    details: trimmedDetails ? trimmedDetails : undefined,
                }),
            });
            if (!res.ok) {
                const txt = await res.text().catch(() => "");
                throw new Error(`${res.status} ${res.statusText} ${txt}`);
            }

            setIssueSavedForQuestionId((prev) => ({ ...prev, [issueQuestion.id]: true }));
            setIssueOpenForQuestionId(null);
            setDetails("");
            setIssue("Wrong answer");
        } catch (e) {
            setIssueError(e instanceof Error ? e.message : "Failed to submit issue");
        } finally {
            setSendingIssue(false);
        }
    }

    return (
        <MathJaxContext config={mathjaxConfig}>
            <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                <div className="text-lg font-semibold">{testTitle}</div>
                <div className="mt-1 text-sm opacity-70">View all questions and report any issue directly.</div>
            </div>

            <div className="mt-4 grid gap-4">
                {viewerQuestions.map((q) => (
                    <div
                        key={q.id}
                        className="rounded-lg border p-4"
                        style={{ borderColor: "var(--border)", background: "var(--card)" }}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs opacity-70">
                                Q{q.index} · {q.subjectName} · {q.topicName}
                            </div>
                            <div className="flex items-center gap-2">
                                {issueSavedForQuestionId[q.id] ? (
                                    <span
                                        className="text-xs rounded-full border px-2 py-0.5"
                                        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                    >
                                        Issue reported
                                    </span>
                                ) : null}
                                <button
                                    type="button"
                                    className="text-xs rounded-full border px-3 py-1 ui-click"
                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                    onClick={() => void openEdit(q.id)}
                                >
                                    Edit question
                                </button>
                                <button
                                    type="button"
                                    className="text-xs rounded-full border px-3 py-1 ui-click"
                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                    onClick={() => {
                                        setIssueError(null);
                                        setIssue("Wrong answer");
                                        setDetails("");
                                        setIssueOpenForQuestionId(q.id);
                                    }}
                                >
                                    Report issue
                                </button>
                            </div>
                        </div>

                        <div className="mt-4 text-base leading-relaxed">
                            {q.imageUrls.length ? (
                                <div className={`mb-3 grid gap-2 mx-auto ${q.imageUrls.length > 1 ? "sm:grid-cols-2 max-w-3xl" : "max-w-4xl"}`}>
                                    {q.imageUrls.map((url) => (
                                        <div
                                            key={url}
                                            className={`rounded border p-2 flex items-center justify-center w-full relative ${q.imageUrls.length > 1 ? "h-44 sm:h-56" : "h-64 sm:h-80"}`}
                                            style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={optimizeImageDelivery(url)}
                                                alt="Question"
                                                className="max-w-full max-h-full object-contain"
                                                loading="lazy"
                                                decoding="async"
                                                referrerPolicy="no-referrer"
                                            />
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                            <MathJax dynamic>{q.questionText}</MathJax>
                        </div>

                        <div className="mt-4 grid gap-2">
                            {q.markingSchemeType === "MAINS_NUMERICAL" || q.markingSchemeType === "ADV_NAT" ? (
                                <div className="rounded border p-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                                    Correct answer: <span className="font-medium">{formatAnswer(q.correctAnswer)}</span>
                                </div>
                            ) : (
                                q.options.map((o) => {
                                    const optionImageUrls = o.imageUrl ? splitUrlList(o.imageUrl) : [];
                                    const optionHasMultipleImages = optionImageUrls.length > 1;
                                    const correct = isCorrectOption(q.markingSchemeType, q.correctAnswer, o.key);

                                    return (
                                        <div
                                            key={o.key}
                                            className={`rounded border p-3 ${correct ? "ring-1 ring-emerald-500" : ""}`}
                                            style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="text-xs font-mono opacity-70">{o.key}.</div>
                                                <div className="min-w-0 text-sm leading-relaxed">
                                                    <MathJax dynamic>{o.text}</MathJax>

                                                    {optionImageUrls.length ? (
                                                        <div className={`mt-2 grid gap-2 ${optionHasMultipleImages ? "sm:grid-cols-2" : ""}`}>
                                                            {optionImageUrls.map((url) => (
                                                                <div
                                                                    key={url}
                                                                    className={`rounded border p-2 flex items-center justify-center w-full relative ${optionHasMultipleImages ? "h-32 sm:h-40" : "h-40 sm:h-48"}`}
                                                                    style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                                                >
                                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                    <img
                                                                        src={optimizeImageDelivery(url)}
                                                                        alt={`Option ${o.key}`}
                                                                        className="max-w-full max-h-full object-contain"
                                                                        loading="lazy"
                                                                        decoding="async"
                                                                        referrerPolicy="no-referrer"
                                                                    />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : null}
                                                </div>
                                                {correct ? (
                                                    <div className="text-xs text-emerald-400 shrink-0">Correct</div>
                                                ) : null}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {issueQuestion ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ background: "rgba(0,0,0,0.45)" }}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Report question issue"
                >
                    <div
                        className="w-full max-w-md rounded-lg border p-4"
                        style={{ borderColor: "var(--border)", background: "var(--card)" }}
                    >
                        <div className="text-base font-semibold">Report issue for Q{issueQuestion.index}</div>
                        <div className="mt-1 text-sm opacity-70">
                            {issueQuestion.subjectName} · {issueQuestion.topicName}
                        </div>

                        <label className="mt-4 block text-sm">
                            <div className="text-xs opacity-70">What is the issue?</div>
                            <select
                                className="mt-2 w-full rounded border px-3 py-2 bg-transparent ui-field"
                                style={{ borderColor: "var(--border)" }}
                                value={issue}
                                onChange={(e) => setIssue(e.target.value)}
                                disabled={sendingIssue}
                            >
                                <option value="">Select...</option>
                                <option value="Wrong answer">Wrong answer</option>
                                <option value="Wrong question statement">Wrong question statement</option>
                                <option value="Typo / formatting">Typo / formatting</option>
                                <option value="Image missing">Image missing</option>
                                <option value="Other">Other</option>
                            </select>
                        </label>

                        <label className="mt-3 block text-sm">
                            <div className="text-xs opacity-70">Details (optional)</div>
                            <textarea
                                className="mt-2 w-full min-h-24 rounded border px-3 py-2 bg-transparent ui-field"
                                style={{ borderColor: "var(--border)" }}
                                value={details}
                                onChange={(e) => setDetails(e.target.value)}
                                placeholder="Add any extra context"
                                disabled={sendingIssue}
                            />
                        </label>

                        {issueError ? (
                            <div className="mt-3 text-sm text-red-600">{issueError}</div>
                        ) : null}

                        <div className="mt-4 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                className="text-xs rounded-full border px-3 py-1 ui-click"
                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                onClick={() => setIssueOpenForQuestionId(null)}
                                disabled={sendingIssue}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="text-xs font-medium rounded-full border px-3 py-1 ui-click"
                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                onClick={() => void submitIssue()}
                                disabled={sendingIssue || issue.trim().length === 0}
                            >
                                {sendingIssue ? "Submitting..." : "Submit"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {editOpenForQuestionId ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ background: "rgba(0,0,0,0.45)" }}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Edit question"
                >
                    <div
                        className="w-full max-w-3xl rounded-lg border p-4"
                        style={{ borderColor: "var(--border)", background: "var(--card)" }}
                    >
                        <div className="text-base font-semibold">Edit question</div>
                        <div className="mt-1 text-sm opacity-70">
                            Update any field (options, answers, text, images, scheme) and save to DB.
                        </div>

                        <textarea
                            className="mt-3 w-full min-h-[340px] rounded border px-3 py-2 bg-transparent ui-field font-mono text-xs"
                            style={{ borderColor: "var(--border)" }}
                            value={editRaw}
                            onChange={(e) => setEditRaw(e.target.value)}
                            disabled={loadingEdit || savingEdit}
                            placeholder={loadingEdit ? "Loading question..." : "Raw question JSON"}
                        />

                        {editError ? (
                            <div className="mt-2 text-sm text-red-600">{editError}</div>
                        ) : null}
                        {editSuccess ? (
                            <div className="mt-2 text-sm text-emerald-500">{editSuccess}</div>
                        ) : null}

                        <div className="mt-4 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                className="text-xs rounded-full border px-3 py-1 ui-click"
                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                onClick={() => void copyEditJson()}
                                disabled={loadingEdit || savingEdit || copyingEdit || !editRaw.trim()}
                            >
                                {copyingEdit ? "Copying..." : "Copy JSON"}
                            </button>
                            <button
                                type="button"
                                className="text-xs rounded-full border px-3 py-1 ui-click"
                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                onClick={() => {
                                    setEditOpenForQuestionId(null);
                                    setEditError(null);
                                    setEditSuccess(null);
                                    setEditRaw("");
                                }}
                                disabled={savingEdit}
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                className="text-xs font-medium rounded-full border px-3 py-1 ui-click"
                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                onClick={() => void saveEdit()}
                                disabled={loadingEdit || savingEdit || !editRaw.trim()}
                            >
                                {savingEdit ? "Saving..." : "Save changes"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </MathJaxContext>
    );
}
