"use client";

import Link from "next/link";
import { MathJax, MathJaxContext } from "better-react-mathjax";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import type { QuestionOption } from "@/lib/types";
import { optimizeImageDelivery } from "@/lib/image-delivery";
import { apiPost } from "@/lib/api";

const mathjaxConfig = {
    loader: { load: ["[tex]/mhchem"] },
    tex: {
        packages: { "[+]": ["mhchem"] },
        inlineMath: [["$", "$"], ["\\(", "\\)"]],
        displayMath: [["$$", "$$"], ["\\[", "\\]"]],
    },
} as const;

type ReportPayload = {
    attempt: {
        id: string;
        studentId: string;
        studentName: string | null;
        status: string;
        score: number | null;
        startTimestamp: string;
        endTimestamp: string | null;
        test: { title: string; totalDurationMinutes: number };
    };
    analytics: {
        subjectSummary: Record<
            string,
            { totalTimeSeconds: number; correct: number; incorrect: number; unattempted: number }
        >;
        totalTimeSeconds: number;
        timeOnCorrectSeconds: number;
        timeOnIncorrectSeconds: number;
        topicAccuracy: Array<{ topic: string; accuracy: number; correct: number; total: number }>;
        perQuestion: Array<{
            questionId: string;
            subject: string;
            topicName: string;
            questionText: string;
            imageUrls: string[] | null;
            options: QuestionOption[];
            markingSchemeType: string;
            selectedAnswer: unknown;
            correctAnswer: unknown;
            timeSpentSeconds: number;
            attempted: boolean;
            correct: boolean;
            paletteStatus: string;
            marks: number;
            reflection: {
                wrongReason: string | null;
                leftReason: string | null;
                slowReason: string | null;
                savedAt: string;
            } | null;
        }>;
    };
};

type ReflectionDraft = {
    wrongReason: string;
    leftReason: string;
    slowReason: string;
};

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableApiError(msg: string): boolean {
    return (
        /^404\b|^408\b|^425\b|^429\b|^500\b|^502\b|^503\b|^504\b/.test(msg) ||
        /failed to fetch|networkerror|load failed|network request failed/i.test(msg)
    );
}

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

function fmt(s: number) {
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return `${mm}m ${ss}s`;
}

function fmtCompact(s: number) {
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return mm > 0 ? `${mm}m ${ss}s` : `${ss}s`;
}

function formatAnswer(value: unknown): string {
    if (value == null) return "—";
    if (Array.isArray(value)) return value.map(String).join(", ");
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        const s = String(value);
        return s.trim() ? s : "—";
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

export function AttemptReportClient({ attemptId }: { attemptId: string }) {
    const [data, setData] = useState<ReportPayload | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [redirecting, setRedirecting] = useState(false);
    const [attemptNo, setAttemptNo] = useState(0);
    const [reflectionByQid, setReflectionByQid] = useState<Record<string, ReflectionDraft>>({});
    const [savingByQid, setSavingByQid] = useState<Record<string, boolean>>({});
    const [saveMsgByQid, setSaveMsgByQid] = useState<Record<string, string | null>>({});
    const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        let intervalId: ReturnType<typeof setInterval> | null = null;

        const applyReportData = (res: ReportPayload) => {
            setData(res);
            setError(null);
            setReflectionByQid((prev) => {
                const next: Record<string, ReflectionDraft> = { ...prev };
                for (const q of res.analytics.perQuestion) {
                    const existing = next[q.questionId];
                    next[q.questionId] = {
                        wrongReason: existing?.wrongReason ?? q.reflection?.wrongReason ?? "",
                        leftReason: existing?.leftReason ?? q.reflection?.leftReason ?? "",
                        slowReason: existing?.slowReason ?? q.reflection?.slowReason ?? "",
                    };
                }
                return next;
            });
        };

        const fetchLatest = async () => {
            const res = await apiGet<ReportPayload>(`/api/attempts/${attemptId}/report`);
            if (cancelled) return;
            applyReportData(res);
            if (res.attempt.status !== "IN_PROGRESS" && intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }
        };

        (async () => {
            const maxAttempts = 12;

            for (let i = 0; i < maxAttempts; i += 1) {
                if (cancelled) return;
                setAttemptNo(i + 1);

                try {
                    const res = await apiGet<ReportPayload>(`/api/attempts/${attemptId}/report`);
                    if (!cancelled) {
                        applyReportData(res);
                        if (res.attempt.status === "IN_PROGRESS") {
                            intervalId = setInterval(() => {
                                void fetchLatest().catch((e) => {
                                    const msg = e instanceof Error ? e.message : "Failed to refresh report";
                                    if (msg.startsWith("401")) {
                                        setRedirecting(true);
                                        window.location.href = "/login";
                                    }
                                });
                            }, 5000);
                        }
                    }
                    return;
                } catch (e) {
                    const msg = e instanceof Error ? e.message : "Failed to load report";
                    if (msg.startsWith("401")) {
                        setRedirecting(true);
                        window.location.href = "/login";
                        return;
                    }

                    if (!isRetryableApiError(msg)) {
                        setError(msg);
                        return;
                    }

                    if (i === maxAttempts - 1) {
                        setError("Report is still being generated. Please reload in a few seconds.");
                        return;
                    }

                    await sleep(500 + i * 300);
                }
            }
        })();
        return () => {
            cancelled = true;
            if (intervalId) clearInterval(intervalId);
        };
    }, [attemptId]);

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-sm text-red-600">{error}</div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-sm opacity-70">
                    {redirecting ? "Redirecting…" : `Generating report… (${attemptNo}/12)`}
                </div>
            </div>
        );
    }

    const subjects = Object.entries(data.analytics.subjectSummary);

    async function saveReflection(questionId: string) {
        const draft = reflectionByQid[questionId] ?? {
            wrongReason: "",
            leftReason: "",
            slowReason: "",
        };

        const wrongReason = draft.wrongReason.trim();
        const leftReason = draft.leftReason.trim();
        const slowReason = draft.slowReason.trim();

        if (!wrongReason && !leftReason && !slowReason) {
            setSaveMsgByQid((prev) => ({
                ...prev,
                [questionId]: "Please write at least one reason before saving.",
            }));
            return;
        }

        setSavingByQid((prev) => ({ ...prev, [questionId]: true }));
        setSaveMsgByQid((prev) => ({ ...prev, [questionId]: null }));
        try {
            await apiPost(`/api/attempts/${attemptId}/report-reflections`, {
                questionId,
                wrongReason,
                leftReason,
                slowReason,
            });
            setSaveMsgByQid((prev) => ({ ...prev, [questionId]: "Saved" }));
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Failed to save";
            setSaveMsgByQid((prev) => ({ ...prev, [questionId]: msg }));
        } finally {
            setSavingByQid((prev) => ({ ...prev, [questionId]: false }));
        }
    }

    return (
        <MathJaxContext config={mathjaxConfig}>
            <div className="min-h-screen flex flex-col">
                <header
                    className="sticky top-0 z-50 border-b"
                    style={{ borderColor: "var(--border)", background: "var(--background)" }}
                >
                    <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
                        <Link
                            href="/"
                            className="text-xs rounded-full border px-3 py-1 ui-click"
                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        >
                            ← Home
                        </Link>
                        <div className="text-sm opacity-70">Attempt Report</div>
                    </div>
                </header>

                <main className="max-w-4xl mx-auto w-full px-4 py-8">
                    <h1 className="text-2xl font-semibold">{data.attempt.test.title}</h1>
                    <div className="mt-2 text-sm opacity-70">
                        Attempt {data.attempt.id.slice(0, 8)} · Status {data.attempt.status}
                    </div>

                    <div className="mt-1 text-xs opacity-60">Student: {data.attempt.studentName ?? "—"}</div>

                    <div className="mt-6 grid gap-3 md:grid-cols-4">
                        <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                            <div className="text-xs opacity-70">Score</div>
                            <div className="text-2xl font-semibold">{data.attempt.score ?? "—"}</div>
                        </div>
                        <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                            <div className="text-xs opacity-70">Total Time Spent</div>
                            <div className="text-lg font-semibold">{fmt(data.analytics.totalTimeSeconds)}</div>
                        </div>
                        <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                            <div className="text-xs opacity-70">Time on Correct</div>
                            <div className="text-lg font-semibold">{fmt(data.analytics.timeOnCorrectSeconds)}</div>
                        </div>
                        <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                            <div className="text-xs opacity-70">Time on Incorrect</div>
                            <div className="text-lg font-semibold">{fmt(data.analytics.timeOnIncorrectSeconds)}</div>
                        </div>
                    </div>

                    <div className="mt-8">
                        <h2 className="text-lg font-semibold">Section Summary</h2>
                        <div className="mt-3 grid gap-3 md:grid-cols-3">
                            {subjects.map(([name, s]) => (
                                <div key={name} className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                                    <div className="font-medium">{name}</div>
                                    <div className="mt-2 text-sm opacity-80">Time: {fmt(s.totalTimeSeconds)}</div>
                                    <div className="text-sm opacity-80">Correct: {s.correct}</div>
                                    <div className="text-sm opacity-80">Incorrect: {s.incorrect}</div>
                                    <div className="text-sm opacity-80">Unattempted: {s.unattempted}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="mt-8">
                        <h2 className="text-lg font-semibold">Weak Topics</h2>
                        <div className="mt-3 grid gap-2">
                            {data.analytics.topicAccuracy.slice(0, 8).map((t) => (
                                <div key={t.topic} className="rounded border p-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="font-medium">{t.topic}</div>
                                        <div className="text-sm opacity-70">
                                            {(t.accuracy * 100).toFixed(0)}% ({t.correct}/{t.total})
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="mt-8">
                        <h2 className="text-lg font-semibold">Question-wise Report</h2>
                        <div className="mt-3 grid gap-4">
                            {data.analytics.perQuestion.map((q, idx) => {
                                const resultLabel = !q.attempted ? "Unattempted" : q.correct ? "Correct" : "Incorrect";
                                const resultClass = !q.attempted
                                    ? "opacity-70"
                                    : q.correct
                                        ? "text-green-600"
                                        : "text-red-600";
                                const timeClass = q.timeSpentSeconds > 240
                                    ? "text-red-500 font-medium"
                                    : q.timeSpentSeconds > 180
                                        ? "text-amber-400 font-medium"
                                        : "opacity-70";
                                const tookLong = q.timeSpentSeconds > 240;
                                const draft = reflectionByQid[q.questionId] ?? {
                                    wrongReason: "",
                                    leftReason: "",
                                    slowReason: "",
                                };
                                const isExpanded = expandedQuestionId === q.questionId;

                                return (
                                    <div
                                        key={q.questionId}
                                        className="rounded-lg border p-4"
                                        style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div className="text-xs opacity-70">
                                                Q{idx + 1} · {q.subject} · {q.topicName}
                                            </div>
                                            <div className="flex items-center gap-3 text-xs">
                                                <div className={`font-medium ${resultClass}`}>{resultLabel}</div>
                                                <div className={timeClass}>Time: {fmtCompact(q.timeSpentSeconds)}</div>
                                                <div className="opacity-70">Marks: {q.marks.toFixed(2)}</div>
                                                <button
                                                    type="button"
                                                    className="rounded-full border px-2 py-0.5 ui-click"
                                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                                    onClick={() => {
                                                        setExpandedQuestionId((prev) =>
                                                            prev === q.questionId ? null : q.questionId,
                                                        );
                                                    }}
                                                >
                                                    {isExpanded ? "Hide" : "View"}
                                                </button>
                                            </div>
                                        </div>

                                        {isExpanded ? (
                                            <>
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

                                                {q.options?.length ? (
                                                    <div className="mt-4 grid gap-2">
                                                        {q.options.map((o) => {
                                                            const optionImageUrls = o.imageUrl ? splitUrlList(o.imageUrl) : [];
                                                            const optionHasMultipleImages = optionImageUrls.length > 1;

                                                            return (
                                                                <div
                                                                    key={o.key}
                                                                    className="rounded border p-3"
                                                                    style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                                                >
                                                                    <div className="flex items-start gap-3">
                                                                        <div className="mt-0.5 text-xs font-mono opacity-70">{o.key}.</div>
                                                                        <div className="text-sm leading-relaxed min-w-0">
                                                                            <MathJax dynamic>{o.text}</MathJax>

                                                                            {optionImageUrls.length ? (
                                                                                <div
                                                                                    className={`mt-2 grid gap-2 ${optionHasMultipleImages ? "sm:grid-cols-2" : ""}`}
                                                                                >
                                                                                    {optionImageUrls.map((url) => (
                                                                                        <div
                                                                                            key={url}
                                                                                            className={`rounded border p-2 flex items-center justify-center w-full relative ${optionHasMultipleImages
                                                                                                ? "h-32 sm:h-40"
                                                                                                : "h-40 sm:h-48"}`}
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
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : null}

                                                <div className="mt-4 grid gap-1 text-sm">
                                                    <div>
                                                        <span className="opacity-70">Marked answer:</span> {formatAnswer(q.selectedAnswer)}
                                                    </div>
                                                    <div>
                                                        <span className="opacity-70">Correct answer:</span> {formatAnswer(q.correctAnswer)}
                                                    </div>
                                                </div>

                                                {(!q.correct || !q.attempted || tookLong) ? (
                                                    <div
                                                        className="mt-4 rounded border p-3"
                                                        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                                    >
                                                        <div className="text-sm font-medium">Reflection</div>
                                                        <div className="mt-1 text-xs opacity-70">
                                                            Add your analysis to improve future attempts.
                                                        </div>

                                                        {!q.correct && q.attempted ? (
                                                            <label className="mt-3 block text-sm">
                                                                <div className="text-xs opacity-70">Why was this answer wrong?</div>
                                                                <textarea
                                                                    className="mt-2 w-full min-h-20 rounded border px-3 py-2 bg-transparent ui-field"
                                                                    style={{ borderColor: "var(--border)" }}
                                                                    value={draft.wrongReason}
                                                                    onChange={(e) => {
                                                                        const value = e.target.value;
                                                                        setReflectionByQid((prev) => ({
                                                                            ...prev,
                                                                            [q.questionId]: { ...draft, wrongReason: value },
                                                                        }));
                                                                    }}
                                                                    placeholder="Example: I misread the condition in line 2 and chose option B too quickly."
                                                                />
                                                            </label>
                                                        ) : null}

                                                        {!q.attempted ? (
                                                            <label className="mt-3 block text-sm">
                                                                <div className="text-xs opacity-70">Why did you leave this question?</div>
                                                                <textarea
                                                                    className="mt-2 w-full min-h-20 rounded border px-3 py-2 bg-transparent ui-field"
                                                                    style={{ borderColor: "var(--border)" }}
                                                                    value={draft.leftReason}
                                                                    onChange={(e) => {
                                                                        const value = e.target.value;
                                                                        setReflectionByQid((prev) => ({
                                                                            ...prev,
                                                                            [q.questionId]: { ...draft, leftReason: value },
                                                                        }));
                                                                    }}
                                                                    placeholder="Example: I wasn't confident with the concept and prioritized other questions."
                                                                />
                                                            </label>
                                                        ) : null}

                                                        {tookLong ? (
                                                            <label className="mt-3 block text-sm">
                                                                <div className="text-xs opacity-70">Why did this take more than 4 minutes?</div>
                                                                <textarea
                                                                    className="mt-2 w-full min-h-20 rounded border px-3 py-2 bg-transparent ui-field"
                                                                    style={{ borderColor: "var(--border)" }}
                                                                    value={draft.slowReason}
                                                                    onChange={(e) => {
                                                                        const value = e.target.value;
                                                                        setReflectionByQid((prev) => ({
                                                                            ...prev,
                                                                            [q.questionId]: { ...draft, slowReason: value },
                                                                        }));
                                                                    }}
                                                                    placeholder="Example: I tried two long methods before finding the shorter approach."
                                                                />
                                                            </label>
                                                        ) : null}

                                                        <div className="mt-3 flex items-center gap-3">
                                                            <button
                                                                type="button"
                                                                className="text-xs rounded-full border px-3 py-1 ui-click"
                                                                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                                                onClick={() => void saveReflection(q.questionId)}
                                                                disabled={Boolean(savingByQid[q.questionId])}
                                                            >
                                                                {savingByQid[q.questionId] ? "Saving..." : "Save reflection"}
                                                            </button>
                                                            {saveMsgByQid[q.questionId] ? (
                                                                <div className="text-xs opacity-70">{saveMsgByQid[q.questionId]}</div>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </main>
            </div>
        </MathJaxContext>
    );
}
