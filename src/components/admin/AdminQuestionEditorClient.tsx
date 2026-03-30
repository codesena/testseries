"use client";

import { MathJax, MathJaxContext } from "better-react-mathjax";
import { useEffect, useMemo, useState } from "react";
import { optimizeImageDelivery } from "@/lib/image-delivery";

type SubjectItem = { id: number; name: string };

type TestItem = { id: string; title: string; createdAt: string };

type QuestionListItem = {
    id: string;
    orderIndex: number;
    subjectId: number;
    subjectName: string;
    topicName: string;
    markingSchemeType: string;
    difficultyRank: number | null;
    previewText: string;
    issueCount: number;
    issues: Array<{
        id: string;
        source: "student" | "admin";
        createdAt: string;
        issue: string;
        details: string | null;
        reporterName: string | null;
        reporterUsername: string | null;
        attemptId: string | null;
        attemptOwnerName: string | null;
        attemptOwnerUsername: string | null;
    }>;
};

type QuestionRaw = {
    subjectId: number;
    topicName: string;
    questionText: string;
    imageUrls: unknown;
    options: unknown;
    correctAnswer: unknown;
    markingSchemeType: "MAINS_SINGLE" | "MAINS_NUMERICAL" | "ADV_MULTI_CORRECT" | "ADV_NAT";
    difficultyRank: number | null;
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

function formatAnswer(value: unknown): string {
    if (value == null) return "-";
    if (Array.isArray(value)) return value.map(String).join(", ");
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function isCorrectOption(markingSchemeType: QuestionRaw["markingSchemeType"], correctAnswer: unknown, key: string): boolean {
    if (markingSchemeType === "ADV_MULTI_CORRECT") {
        return Array.isArray(correctAnswer) ? correctAnswer.map(String).includes(key) : false;
    }
    if (markingSchemeType === "MAINS_SINGLE") {
        return String(correctAnswer) === key;
    }
    return false;
}

export function AdminQuestionEditorClient() {
    const [subjects, setSubjects] = useState<SubjectItem[]>([]);
    const [tests, setTests] = useState<TestItem[]>([]);
    const [selectedTestId, setSelectedTestId] = useState<string>("");
    const [questions, setQuestions] = useState<QuestionListItem[]>([]);
    const [search, setSearch] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [rawText, setRawText] = useState("");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [preview, setPreview] = useState<QuestionRaw | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    async function loadList(nextTestId?: string) {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            const testIdToUse = (nextTestId ?? selectedTestId).trim();
            if (testIdToUse) params.set("testId", testIdToUse);
            if (search.trim()) params.set("q", search.trim());
            params.set("limit", "200");
            const res = await fetch(`/api/admin/questions?${params.toString()}`, { cache: "no-store" });
            if (!res.ok) {
                const txt = await res.text().catch(() => "");
                throw new Error(`${res.status} ${res.statusText} ${txt}`);
            }
            const data = (await res.json()) as {
                subjects: SubjectItem[];
                tests: TestItem[];
                selectedTestId: string;
                questions: QuestionListItem[];
            };
            setSubjects(data.subjects);
            setTests(data.tests);
            setSelectedTestId(data.selectedTestId);
            setQuestions(data.questions);

            const nextSelectedId =
                data.questions.some((qItem) => qItem.id === selectedId)
                    ? selectedId
                    : (data.questions[0]?.id ?? null);

            if (nextSelectedId) {
                if (nextSelectedId !== selectedId || !rawText.trim()) {
                    void loadQuestion(nextSelectedId);
                } else {
                    setSelectedId(nextSelectedId);
                }
            } else {
                setSelectedId(null);
                setRawText("");
                setPreview(null);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load questions");
        } finally {
            setLoading(false);
        }
    }

    async function loadQuestion(questionId: string) {
        setSelectedId(questionId);
        setError(null);
        setSuccess(null);
        setPreview(null);
        try {
            const res = await fetch(`/api/admin/questions/${questionId}`, { cache: "no-store" });
            if (!res.ok) {
                const txt = await res.text().catch(() => "");
                throw new Error(`${res.status} ${res.statusText} ${txt}`);
            }
            const data = (await res.json()) as { question: QuestionRaw };
            setRawText(JSON.stringify(data.question, null, 2));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load question");
            setRawText("");
        }
    }

    useEffect(() => {
        void loadList();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const t = setTimeout(() => {
            if (!tests.length || !selectedTestId) return;
            void loadList();
        }, 350);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const selectedQuestionMeta = useMemo(
        () => questions.find((qItem) => qItem.id === selectedId) ?? null,
        [questions, selectedId],
    );

    const parsedRaw = useMemo(() => {
        if (!rawText.trim()) return null;
        try {
            return JSON.parse(rawText) as QuestionRaw;
        } catch {
            return null;
        }
    }, [rawText]);

    function handlePreview() {
        setError(null);
        setSuccess(null);
        if (!parsedRaw) {
            setError("Invalid JSON. Please fix raw payload before preview.");
            return;
        }
        setPreview(parsedRaw);
    }

    async function handleSave() {
        if (!selectedId) return;
        setError(null);
        setSuccess(null);

        let payload: QuestionRaw;
        try {
            payload = JSON.parse(rawText) as QuestionRaw;
        } catch {
            setError("Invalid JSON. Please fix raw payload before saving.");
            return;
        }

        setSaving(true);
        try {
            const res = await fetch(`/api/admin/questions/${selectedId}`, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const txt = await res.text().catch(() => "");
                throw new Error(`${res.status} ${res.statusText} ${txt}`);
            }
            const data = (await res.json()) as { question: QuestionRaw };
            setRawText(JSON.stringify(data.question, null, 2));
            setSuccess("Question updated successfully.");
            setPreview(data.question);
            void loadList();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to save question");
        } finally {
            setSaving(false);
        }
    }

    const options = preview ? coerceOptions(preview.options) : [];
    const previewImageUrls = preview && Array.isArray(preview.imageUrls)
        ? (preview.imageUrls as unknown[]).map(String)
        : [];

    return (
        <MathJaxContext config={mathjaxConfig}>
            <div className="grid gap-4 lg:grid-cols-[380px,1fr]">
                <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                    <div className="text-sm font-medium">Paper-wise Question Report</div>
                    <div className="mt-3 grid gap-2">
                        <select
                            className="w-full rounded border px-3 py-2 bg-transparent ui-field"
                            style={{ borderColor: "var(--border)" }}
                            value={selectedTestId}
                            onChange={(e) => {
                                const next = e.target.value;
                                setSelectedTestId(next);
                                void loadList(next);
                            }}
                        >
                            {tests.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.title}
                                </option>
                            ))}
                            {!tests.length ? <option value="">No papers found</option> : null}
                        </select>
                        <input
                            className="w-full rounded border px-3 py-2 bg-transparent ui-field"
                            style={{ borderColor: "var(--border)" }}
                            placeholder="Search in selected paper"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    void loadList();
                                }
                            }}
                        />
                        <button
                            type="button"
                            className="text-xs rounded-full border px-3 py-1 ui-click"
                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                            onClick={() => void loadList()}
                            disabled={loading}
                        >
                            {loading ? "Loading..." : "Load Questions"}
                        </button>
                    </div>

                    <div className="mt-3 max-h-[65vh] overflow-auto grid gap-2">
                        {questions.map((q) => (
                            <button
                                key={q.id}
                                type="button"
                                className="text-left rounded border p-2 ui-click"
                                style={{
                                    borderColor: selectedId === q.id ? "#22c55e" : "var(--border)",
                                    background: selectedId === q.id ? "rgba(34,197,94,0.12)" : "var(--muted)",
                                }}
                                onClick={() => void loadQuestion(q.id)}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-xs font-medium truncate">Q{q.orderIndex + 1} · {q.subjectName}</div>
                                    {q.issueCount > 0 ? (
                                        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-200 border-amber-400/40">
                                            Reported {q.issueCount}
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium opacity-70">
                                            Clean
                                        </span>
                                    )}
                                </div>
                                <div className="mt-1 text-xs opacity-70 truncate">{q.topicName}</div>
                                <div className="mt-1 text-xs opacity-60 truncate">{q.previewText}</div>
                                {q.issues[0] ? (
                                    <div className="mt-1 text-[11px] opacity-75 truncate">
                                        Latest: {q.issues[0].issue}
                                    </div>
                                ) : null}
                            </button>
                        ))}
                        {!questions.length ? <div className="text-xs opacity-70">No questions found.</div> : null}
                    </div>
                </div>

                <div className="grid gap-4">
                    {selectedQuestionMeta ? (
                        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-sm font-medium">
                                    Issue Summary · Q{selectedQuestionMeta.orderIndex + 1}
                                </div>
                                <div className="text-xs opacity-70">
                                    {selectedQuestionMeta.subjectName} · {selectedQuestionMeta.topicName}
                                </div>
                            </div>
                            <div className="mt-3 grid gap-2">
                                {selectedQuestionMeta.issues.length ? (
                                    selectedQuestionMeta.issues.map((issueItem) => (
                                        <div
                                            key={issueItem.id}
                                            className="rounded border p-2"
                                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                        >
                                            <div className="flex flex-wrap items-center gap-2 text-xs">
                                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${issueItem.source === "admin" ? "bg-sky-500/20 text-sky-200 border-sky-400/40" : "bg-amber-500/20 text-amber-200 border-amber-400/40"}`}>
                                                    {issueItem.source === "admin" ? "Admin" : "Student"}
                                                </span>
                                                <span className="font-medium">{issueItem.issue}</span>
                                                <span className="opacity-70">{new Date(issueItem.createdAt).toLocaleString()}</span>
                                            </div>
                                            <div className="mt-1 text-xs opacity-80">
                                                Reporter: {issueItem.reporterName ?? "-"}
                                                {issueItem.reporterUsername ? ` (${issueItem.reporterUsername})` : ""}
                                                {issueItem.attemptOwnerUsername ? ` · Attempt owner: ${issueItem.attemptOwnerName ?? "-"} (${issueItem.attemptOwnerUsername})` : ""}
                                                {issueItem.attemptId ? ` · Attempt: ${issueItem.attemptId.slice(0, 8)}` : ""}
                                            </div>
                                            {issueItem.details ? (
                                                <div className="mt-1 text-xs whitespace-pre-wrap">{issueItem.details}</div>
                                            ) : null}
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-xs opacity-70">No reported issues for this question.</div>
                                )}
                            </div>
                        </div>
                    ) : null}

                    <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                        <div className="text-sm font-medium">Raw Question JSON</div>
                        <div className="mt-1 text-xs opacity-70">Select a question above, edit raw payload, then preview rendered form.</div>
                        <textarea
                            className="mt-3 w-full min-h-[360px] rounded border px-3 py-2 bg-transparent ui-field font-mono text-xs"
                            style={{ borderColor: "var(--border)" }}
                            value={rawText}
                            onChange={(e) => setRawText(e.target.value)}
                            placeholder="Select a question to load raw JSON"
                        />
                        <div className="mt-3 flex items-center gap-2">
                            <button
                                type="button"
                                className="text-xs rounded-full border px-3 py-1 ui-click"
                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                onClick={handlePreview}
                                disabled={!selectedId}
                            >
                                Preview Rendered Form
                            </button>
                            <button
                                type="button"
                                className="text-xs rounded-full border px-3 py-1 ui-click"
                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                onClick={() => void handleSave()}
                                disabled={!selectedId || saving}
                            >
                                {saving ? "Saving..." : "Save Question"}
                            </button>
                        </div>
                        {error ? <div className="mt-2 text-xs text-red-400 whitespace-pre-wrap">{error}</div> : null}
                        {success ? <div className="mt-2 text-xs text-emerald-300">{success}</div> : null}
                    </div>

                    {preview ? (
                        <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-sm font-medium">Rendered Preview</div>
                                <div className="text-xs opacity-70">
                                    SubjectId {preview.subjectId} · {preview.markingSchemeType} · Difficulty {preview.difficultyRank ?? "-"}
                                </div>
                            </div>
                            <div className="mt-1 text-xs opacity-70">Topic: {preview.topicName}</div>

                            <div className="mt-3 text-base leading-relaxed">
                                {previewImageUrls.length ? (
                                    <div className={`mb-3 grid gap-2 mx-auto ${previewImageUrls.length > 1 ? "sm:grid-cols-2 max-w-3xl" : "max-w-4xl"}`}>
                                        {previewImageUrls.map((url) => (
                                            <div
                                                key={url}
                                                className={`rounded border p-2 flex items-center justify-center w-full relative ${previewImageUrls.length > 1 ? "h-44 sm:h-56" : "h-64 sm:h-80"}`}
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
                                <MathJax dynamic>{preview.questionText}</MathJax>
                            </div>

                            {options.length ? (
                                <div className="mt-4 grid gap-2">
                                    {options.map((o) => {
                                        const correct = isCorrectOption(preview.markingSchemeType, preview.correctAnswer, o.key);
                                        const optionImageUrls = o.imageUrl ? splitUrlList(o.imageUrl) : [];
                                        const multi = optionImageUrls.length > 1;

                                        return (
                                            <div
                                                key={o.key}
                                                className="rounded border p-3"
                                                style={{
                                                    borderColor: correct ? "#10b981" : "var(--border)",
                                                    background: correct ? "rgba(16,185,129,0.12)" : "var(--card)",
                                                }}
                                            >
                                                <div className="text-xs opacity-70">({o.key})</div>
                                                <div className="mt-1 text-sm min-w-0">
                                                    <MathJax dynamic>{o.text}</MathJax>
                                                </div>

                                                {optionImageUrls.length ? (
                                                    <div className={`mt-2 grid gap-2 ${multi ? "sm:grid-cols-2" : ""}`}>
                                                        {optionImageUrls.map((url) => (
                                                            <div
                                                                key={url}
                                                                className={`rounded border p-2 flex items-center justify-center w-full relative ${multi ? "h-32 sm:h-40" : "h-40 sm:h-48"}`}
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
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="mt-4 text-sm opacity-80">Correct answer: {formatAnswer(preview.correctAnswer)}</div>
                            )}
                        </div>
                    ) : null}
                </div>
            </div>
        </MathJaxContext>
    );
}
