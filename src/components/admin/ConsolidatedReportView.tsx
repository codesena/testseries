"use client";

import { MathJax, MathJaxContext } from "better-react-mathjax";
import { useState } from "react";
import { optimizeImageDelivery } from "@/lib/image-delivery";
import { apiPost } from "@/lib/api";
import type { QuestionOption } from "@/lib/types";

const mathjaxConfig = {
    loader: { load: ["[tex]/mhchem"] },
    tex: {
        packages: { "[+]": ["mhchem"] },
        inlineMath: [["$", "$"], ["\\(", "\\)"]],
        displayMath: [["$$", "$$"], ["\\[", "\\]"]],
    },
} as const;

export type ConsolidatedAttemptMeta = {
    id: string;
    studentName: string;
    studentUsername: string;
    status: string;
    overallScore: number | null;
    startTimestamp: string;
    endTimestamp: string | null;
};

type StudentQuestionView = {
    attemptId: string;
    selectedAnswer: unknown;
    attempted: boolean;
    correct: boolean;
    paletteStatus: string;
    timeSpentSeconds: number;
    marks: number;
    reflection: {
        wrongReason: string | null;
        leftReason: string | null;
        slowReason: string | null;
        savedAt: string;
    } | null;
};

type ConsolidatedQuestion = {
    questionId: string;
    index: number;
    subjectName: string;
    topicName: string;
    questionText: string;
    imageUrls: string[] | null;
    markingSchemeType: string;
    options: QuestionOption[];
    correctAnswer: unknown;
    students: StudentQuestionView[];
};

export type ConsolidatedReportData = {
    attempts: ConsolidatedAttemptMeta[];
    questions: ConsolidatedQuestion[];
};

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
        const s = String(value).trim();
        return s || "-";
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function asStringSet(value: unknown): Set<string> {
    if (Array.isArray(value)) return new Set(value.map(String));
    if (typeof value === "string") return new Set([value]);
    return new Set();
}

function isCorrectOption(markingSchemeType: string, correctAnswer: unknown, key: string): boolean {
    if (markingSchemeType === "ADV_MULTI_CORRECT") {
        return asStringSet(correctAnswer).has(key);
    }
    if (markingSchemeType === "MAINS_SINGLE") {
        return String(correctAnswer) === key;
    }
    return false;
}

function fmtTime(seconds: number): string {
    const clamped = Math.max(0, Math.floor(seconds));
    const mm = Math.floor(clamped / 60);
    const ss = clamped % 60;
    return `${mm}m ${String(ss).padStart(2, "0")}s`;
}

function fmtDate(iso: string | null): string {
    if (!iso) return "-";
    try {
        return new Intl.DateTimeFormat(undefined, {
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        }).format(new Date(iso));
    } catch {
        return iso;
    }
}

function shortAttemptId(id: string): string {
    return id.slice(0, 8);
}

export function ConsolidatedReportView({ data }: { data: ConsolidatedReportData }) {
    if (!data.attempts.length || !data.questions.length) {
        return <div className="text-sm opacity-70">No consolidated data for current selection.</div>;
    }

    const attemptMetaById = new Map(data.attempts.map((a) => [a.id, a] as const));
    const [issueQuestionId, setIssueQuestionId] = useState<string | null>(null);
    const [issueQuestionNumber, setIssueQuestionNumber] = useState<number | null>(null);
    const [issue, setIssue] = useState<string>("");
    const [details, setDetails] = useState<string>("");
    const [sendingIssue, setSendingIssue] = useState(false);
    const [issueError, setIssueError] = useState<string | null>(null);
    const [issueSuccess, setIssueSuccess] = useState<string | null>(null);

    function openIssueModal(questionId: string, questionNumber: number) {
        setIssueQuestionId(questionId);
        setIssueQuestionNumber(questionNumber);
        setIssueError(null);
        setIssueSuccess(null);
        setIssue((v) => (v ? v : "Wrong answer"));
        setDetails("");
    }

    function closeIssueModal() {
        if (sendingIssue) return;
        setIssueQuestionId(null);
        setIssueQuestionNumber(null);
        setIssueError(null);
        setIssueSuccess(null);
    }

    async function submitIssue() {
        if (!issueQuestionId || sendingIssue) return;
        const trimmedIssue = issue.trim();
        const trimmedDetails = details.trim();

        if (!trimmedIssue) {
            setIssueError("Issue title is required.");
            return;
        }

        setSendingIssue(true);
        setIssueError(null);
        setIssueSuccess(null);
        try {
            await apiPost(`/api/admin/questions/${issueQuestionId}/issue`, {
                issue: trimmedIssue,
                details: trimmedDetails ? trimmedDetails : undefined,
            });
            setIssueSuccess("Issue reported successfully.");
            setDetails("");
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Failed to submit issue";
            setIssueError(msg);
        } finally {
            setSendingIssue(false);
        }
    }

    return (
        <MathJaxContext config={mathjaxConfig}>
            <div className="grid gap-5">
                <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                    <div className="text-sm font-medium">Selected attempts</div>
                    <div className="mt-3 grid gap-2">
                        {data.attempts.map((a) => (
                            <div key={a.id} className="rounded border p-3" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                                <div className="text-sm font-medium">{a.studentName} ({a.studentUsername})</div>
                                <div className="mt-1 text-xs opacity-70">
                                    Attempt {shortAttemptId(a.id)} · {a.status} · Score {a.overallScore ?? "-"}
                                </div>
                                <div className="text-xs opacity-60">Start {fmtDate(a.startTimestamp)} · End {fmtDate(a.endTimestamp)}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {data.questions.map((q) => (
                    <div
                        key={q.questionId}
                        className="rounded-lg border p-4"
                        style={{ borderColor: "var(--border)", background: "var(--card)" }}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-medium">Q{q.index}</div>
                            <div className="flex items-center gap-2">
                                <div className="text-xs opacity-70">{q.subjectName} · {q.topicName}</div>
                                <button
                                    type="button"
                                    className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                    onClick={() => openIssueModal(q.questionId, q.index)}
                                >
                                    Report issue
                                </button>
                            </div>
                        </div>

                        <div className="mt-3 text-base leading-relaxed">
                            {q.imageUrls?.length ? (
                                <div
                                    className={`mb-3 grid gap-2 mx-auto ${q.imageUrls.length > 1 ? "sm:grid-cols-2 max-w-3xl" : "max-w-4xl"}`}
                                >
                                    {q.imageUrls.map((url) => (
                                        <div
                                            key={url}
                                            className={`rounded border p-2 flex items-center justify-center w-full relative ${q.imageUrls && q.imageUrls.length > 1
                                                ? "h-44 sm:h-56"
                                                : "h-64 sm:h-80"}`}
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

                        {q.options.length ? (
                            <div className="mt-4 grid gap-2">
                                {q.options.map((o) => {
                                    const correct = isCorrectOption(q.markingSchemeType, q.correctAnswer, o.key);
                                    const optionImageUrls = o.imageUrl ? splitUrlList(o.imageUrl) : [];
                                    const optionHasMultipleImages = optionImageUrls.length > 1;

                                    return (
                                        <div
                                            key={o.key}
                                            className="rounded border p-3"
                                            style={{
                                                borderColor: correct ? "#10b981" : "var(--border)",
                                                background: correct ? "rgba(16,185,129,0.12)" : "var(--card)",
                                            }}
                                        >
                                            <div className="flex items-start gap-2">
                                                <span className="text-xs opacity-70 shrink-0">({o.key})</span>
                                                <div className="min-w-0">
                                                    {o.text ? <MathJax dynamic>{o.text}</MathJax> : null}

                                                    {optionImageUrls.length ? (
                                                        <div className={`mt-2 grid gap-2 ${optionHasMultipleImages ? "sm:grid-cols-2" : ""}`}>
                                                            {optionImageUrls.map((url) => (
                                                                <div
                                                                    key={url}
                                                                    className={`rounded border p-2 flex items-center justify-center w-full relative ${optionHasMultipleImages
                                                                        ? "h-32 sm:h-40"
                                                                        : "h-40 sm:h-48"}`}
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
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="mt-4 text-sm opacity-70">Correct answer: {formatAnswer(q.correctAnswer)}</div>
                        )}

                        <div className="mt-4 grid gap-3">
                            {q.students.map((s) => (
                                (() => {
                                    const meta = attemptMetaById.get(s.attemptId);
                                    const studentLabel = meta
                                        ? `${meta.studentName} (${meta.studentUsername}) · Attempt ${shortAttemptId(s.attemptId)}`
                                        : `Attempt ${shortAttemptId(s.attemptId)}`;
                                    const resultText = s.attempted ? (s.correct ? "Correct" : "Incorrect") : "Left";
                                    const resultClass = !s.attempted
                                        ? "bg-amber-500/20 text-amber-200 border-amber-400/40"
                                        : s.correct
                                            ? "bg-emerald-500/20 text-emerald-200 border-emerald-400/40"
                                            : "bg-red-500/20 text-red-200 border-red-400/40";
                                    const tookLong = s.timeSpentSeconds > 240;
                                    const shouldShowWrong = s.attempted && !s.correct;
                                    const shouldShowLeft = !s.attempted;
                                    const shouldShowSlow = tookLong;
                                    const slowLabel = s.correct
                                        ? "Improvement note (>4m):"
                                        : "Slow reason (>4m):";

                                    return (
                                        <div
                                            key={s.attemptId}
                                            className="rounded-lg border p-3"
                                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                        >
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="text-sm font-medium">{studentLabel}</div>
                                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${resultClass}`}>
                                                    Result: {resultText}
                                                </span>
                                            </div>

                                            <div className="mt-2 text-sm">
                                                Answer: <span className="font-semibold">{formatAnswer(s.selectedAnswer)}</span>
                                            </div>

                                            <div className="mt-1 text-xs opacity-80">
                                                Marks {s.marks.toFixed(2)}
                                                {" · "}Time {fmtTime(s.timeSpentSeconds)}
                                                {" · "}Palette {s.paletteStatus}
                                            </div>

                                            {(shouldShowWrong || shouldShowLeft || shouldShowSlow) ? (
                                                <div
                                                    className="mt-3 rounded border p-2 text-xs"
                                                    style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                                >
                                                    {shouldShowWrong ? (
                                                        <div>
                                                            <span className="opacity-70">Wrong reason:</span>{" "}
                                                            {s.reflection?.wrongReason ?? "-"}
                                                        </div>
                                                    ) : null}
                                                    {shouldShowLeft ? (
                                                        <div>
                                                            <span className="opacity-70">Left reason:</span>{" "}
                                                            {s.reflection?.leftReason ?? "-"}
                                                        </div>
                                                    ) : null}
                                                    {shouldShowSlow ? (
                                                        <div>
                                                            <span className="opacity-70">{slowLabel}</span>{" "}
                                                            {s.reflection?.slowReason ?? "-"}
                                                        </div>
                                                    ) : null}
                                                    <div className="mt-1 opacity-60">Saved: {fmtDate(s.reflection?.savedAt ?? null)}</div>
                                                </div>
                                            ) : null}
                                        </div>
                                    );
                                })()
                            ))}
                        </div>
                    </div>
                ))}

                {issueQuestionId ? (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        style={{ background: "rgba(0,0,0,0.45)" }}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Report issue"
                    >
                        <div
                            className="w-full max-w-md rounded-lg border p-4"
                            style={{ borderColor: "var(--border)", background: "var(--card)" }}
                        >
                            <div className="text-base font-semibold">Report issue for Q{issueQuestionNumber ?? "?"}</div>
                            <div className="mt-1 text-sm opacity-70">This will be logged as an admin-reported question issue.</div>

                            <label className="mt-4 block text-sm">
                                <div className="text-xs opacity-70">What is the issue?</div>
                                <select
                                    className="mt-2 w-full rounded border px-3 py-2 bg-transparent ui-field"
                                    style={{ borderColor: "var(--border)" }}
                                    value={issue}
                                    onChange={(e) => setIssue(e.target.value)}
                                    disabled={sendingIssue}
                                >
                                    <option value="">Select…</option>
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
                                    placeholder="Add extra context"
                                    disabled={sendingIssue}
                                />
                            </label>

                            {issueError ? <div className="mt-3 text-xs text-red-400">{issueError}</div> : null}
                            {issueSuccess ? <div className="mt-3 text-xs text-emerald-300">{issueSuccess}</div> : null}

                            <div className="mt-4 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                    onClick={closeIssueModal}
                                    disabled={sendingIssue}
                                >
                                    Close
                                </button>
                                <button
                                    type="button"
                                    className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                    onClick={() => void submitIssue()}
                                    disabled={sendingIssue}
                                >
                                    {sendingIssue ? "Submitting..." : "Submit issue"}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </MathJaxContext>
    );
}
