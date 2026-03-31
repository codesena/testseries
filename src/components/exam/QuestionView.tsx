"use client";

import { MathJax } from "better-react-mathjax";
import { memo, useState } from "react";
import type { AttemptQuestion } from "@/lib/types";
import { apiPost } from "@/lib/api";
import type { PaletteStatus } from "@/components/exam/palette";
import { optimizeImageDelivery } from "@/lib/image-delivery";

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

export const QuestionView = memo(function QuestionView({
    attemptId,
    questionNumber,
    question,
    answer,
    paletteStatus,
    onSetAnswer,
}: {
    attemptId: string;
    questionNumber?: number;
    question: AttemptQuestion;
    answer: unknown;
    paletteStatus: PaletteStatus;
    onSetAnswer: (value: unknown) => void;
}) {
    const scheme = question.markingSchemeType;
    const selectedSingle = typeof answer === "string" ? answer : null;
    const selectedMulti = Array.isArray(answer) ? new Set(answer.map(String)) : new Set<string>();
    const numericValue =
        typeof answer === "number" ? String(answer) : typeof answer === "string" ? answer : "";

    const [issueOpen, setIssueOpen] = useState(false);
    const [issue, setIssue] = useState<string>("");
    const [details, setDetails] = useState<string>("");
    const [sendingIssue, setSendingIssue] = useState(false);
    const [issueError, setIssueError] = useState<string | null>(null);

    async function submitIssue() {
        if (sendingIssue) return;
        const trimmedIssue = issue.trim();
        const trimmedDetails = details.trim();
        if (!trimmedIssue) return;

        setSendingIssue(true);
        setIssueError(null);
        try {
            await apiPost(
                `/api/attempts/${attemptId}/questions/${question.id}/issue`,
                {
                    issue: trimmedIssue,
                    details: trimmedDetails ? trimmedDetails : undefined,
                },
            );
            setIssueOpen(false);
            setIssue("");
            setDetails("");
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Failed to submit issue";
            setIssueError(msg);
        } finally {
            setSendingIssue(false);
        }
    }

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
                            Q{questionNumber ?? "?"} · {statusLabel(paletteStatus)}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        className="text-xs rounded-full border px-3 py-1 ui-click"
                        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        onClick={() => {
                            setIssueOpen(true);
                            setIssueError(null);
                            setIssue((v) => (v ? v : "Wrong answer"));
                        }}
                        type="button"
                    >
                        Report issue
                    </button>
                </div>
            </div>

            <div className="mt-4 text-base leading-relaxed">
                {question.imageUrls?.length ? (
                    <div
                        className={`mb-3 grid gap-2 mx-auto ${question.imageUrls.length > 1 ? "sm:grid-cols-2 max-w-3xl" : "max-w-4xl"
                            }`}
                    >
                        {question.imageUrls.map((url) => (
                            <div
                                key={url}
                                className={`rounded border p-2 flex items-center justify-center w-full relative ${question.imageUrls && question.imageUrls.length > 1
                                    ? "h-44 sm:h-56"
                                    : "h-64 sm:h-80"
                                    }`}
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

                        const optionImageUrls = o.imageUrl ? splitUrlList(o.imageUrl) : [];
                        const optionHasMultipleImages = optionImageUrls.length > 1;

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
                                        <div className="flex items-baseline gap-2 min-w-0">
                                            <span className="text-xs opacity-70 shrink-0">
                                                ({o.key})
                                            </span>
                                            {o.text ? (
                                                <span className="text-sm min-w-0">
                                                    <MathJax dynamic>{o.text}</MathJax>
                                                </span>
                                            ) : null}
                                        </div>

                                        {optionImageUrls.length ? (
                                            <div
                                                className={`mt-2 grid gap-2 ${optionHasMultipleImages ? "sm:grid-cols-2" : ""}`}
                                            >
                                                {optionImageUrls.map((url) => (
                                                    <div
                                                        key={url}
                                                        className={`rounded border p-2 flex items-center justify-center w-full relative ${optionHasMultipleImages
                                                            ? "h-32 sm:h-40"
                                                            : "h-40 sm:h-48"
                                                            }`}
                                                        style={{
                                                            borderColor: "var(--border)",
                                                            background: "var(--card)",
                                                        }}
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
                            </label>
                        );
                    })
                )}
            </div>

            {issueOpen ? (
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
                        <div className="text-base font-semibold">Report issue</div>
                        <div className="mt-1 text-sm opacity-70">
                            Tell us what’s wrong with this question.
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
                                placeholder="Add any extra context (e.g. which option is wrong)"
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
                                onClick={() => setIssueOpen(false)}
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
                                {sendingIssue ? "Submitting…" : "Submit"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
});
