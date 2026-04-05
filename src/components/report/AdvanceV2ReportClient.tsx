"use client";

import Link from "next/link";
import { MathJax, MathJaxContext } from "better-react-mathjax";
import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api";
import { optimizeImageDelivery } from "@/lib/image-delivery";
import { formatDateTimeIST } from "@/lib/time";
import { ImageCarousel } from "@/components/common/ImageCarousel";

const mathjaxConfig = {
    loader: { load: ["[tex]/mhchem"] },
    tex: {
        packages: { "[+]": ["mhchem"] },
        inlineMath: [["$", "$"], ["\\(", "\\)"]],
        displayMath: [["$$", "$$"], ["\\[", "\\]"]],
    },
} as const;

function formatSectionLabel(sectionCode: string) {
    const raw = String(sectionCode || "").trim();
    if (!raw) return "Section";
    const suffix = raw.includes("-") ? raw.split("-").pop() ?? raw : raw;
    return `Section-${suffix.toUpperCase()}`;
}

type Payload = {
    attempt: {
        id: string;
        studentName?: string | null;
        status: string;
        totalScore: number | null;
        startTimestamp: string;
        scheduledEndAt: string;
        submittedAt: string | null;
    };
    exam: {
        id: string;
        code: string;
        title: string;
        durationMinutes: number;
    };
    summary: {
        totalQuestions: number;
        attempted: number;
        correct: number;
        incorrect: number;
        unattempted: number;
        totalTimeSpentSeconds: number;
        computedTotalScore: number;
    };
    analytics?: {
        subjectSummary: Record<string, {
            totalTimeSeconds: number;
            correct: number;
            incorrect: number;
            unattempted: number;
            netScore: number;
            netNegative: number;
        }>;
        totalTimeSeconds: number;
        timeOnCorrectSeconds: number;
        timeOnIncorrectSeconds: number;
        topicAccuracy: Array<{ topic: string; accuracy: number; correct: number; total: number }>;
    };
    subjectBreakdown: Array<{
        subject: string;
        score: number;
        attempted: number;
        correct: number;
        incorrect: number;
        unattempted: number;
        timeSpentSeconds: number;
        netNegative?: number;
        sections: Array<{
            sectionCode: string;
            title: string;
            attempted: number;
            correct: number;
            questions: Array<{
                questionId: string;
                questionType: "SINGLE_CORRECT" | "MULTI_CORRECT" | "MATCHING_LIST" | "NAT_INTEGER" | "NAT_DECIMAL";
                stemRich: string;
                stemAssets?: unknown;
                topicName?: string | null;
                options: Array<{
                    optionKey: string;
                    labelRich: string;
                    sortOrder: number;
                    isCorrect: boolean | null;
                    assets?: unknown;
                }>;
                answerState: string;
                responseJson: unknown;
                numericValue: number | null;
                correctAnswer: unknown;
                marksAwarded: number;
                attempted: boolean;
                timeSpentSeconds: number;
            }>;
        }>;
    }>;
};

type QuestionType = "SINGLE_CORRECT" | "MULTI_CORRECT" | "MATCHING_LIST" | "NAT_INTEGER" | "NAT_DECIMAL";

type FlatQuestion = {
    index: number;
    subject: string;
    sectionCode: string;
    sectionTitle: string;
    questionId: string;
    questionType: QuestionType;
    stemRich: string;
    stemAssets?: unknown;
    topicName?: string | null;
    options: Array<{
        optionKey: string;
        labelRich: string;
        sortOrder: number;
        isCorrect: boolean | null;
        assets?: unknown;
    }>;
    answerState: string;
    responseJson: unknown;
    numericValue: number | null;
    correctAnswer: unknown;
    marksAwarded: number;
    attempted: boolean;
    timeSpentSeconds: number;
};

type ParsedMatchingStem = {
    intro: string[];
    listI: string[];
    listII: string[];
    outro: string[];
};

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableApiError(msg: string) {
    return (
        /^404\b|^408\b|^425\b|^429\b|^500\b|^502\b|^503\b|^504\b/.test(msg) ||
        /failed to fetch|networkerror|load failed|network request failed/i.test(msg)
    );
}

function isListMarker(line: string, roman: "i" | "ii") {
    const cleaned = line.trim().replace(/[\u2013\u2014]/g, "-");
    if (roman === "i") return /^list\s*-?\s*i\s*:?.*$/i.test(cleaned);
    return /^list\s*-?\s*ii\s*:?.*$/i.test(cleaned);
}

function parseMatchingStem(stem: string): ParsedMatchingStem | null {
    const lines = stem
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    if (!lines.length) return null;

    const listIIndex = lines.findIndex((line) => isListMarker(line, "i"));
    const listIIIndex = lines.findIndex((line) => isListMarker(line, "ii"));

    if (listIIndex === -1 || listIIIndex === -1 || listIIIndex <= listIIndex) return null;

    const intro = lines.slice(0, listIIndex);
    const listI = lines.slice(listIIndex + 1, listIIIndex);
    const afterListII = lines.slice(listIIIndex + 1);

    const firstBreakAfterListII = afterListII.findIndex((line) => !/^\([A-Za-z0-9]+\)/.test(line));
    const listII = firstBreakAfterListII === -1 ? afterListII : afterListII.slice(0, firstBreakAfterListII);
    const outro = firstBreakAfterListII === -1 ? [] : afterListII.slice(firstBreakAfterListII);

    if (!listI.length || !listII.length) return null;
    return { intro, listI, listII, outro };
}

function normalizeMatchingLineForMathJax(line: string): string {
    const trimmed = line.trim();
    const hasExplicitMath = trimmed.includes("$") || trimmed.includes("\\(") || trimmed.includes("\\[");
    const hasLatexCommand = /\\[a-zA-Z]+/.test(trimmed);

    if (!hasLatexCommand || hasExplicitMath) return line;

    const markerMatch = trimmed.match(/^(\([A-Za-z0-9]+\))\s*(.*)$/);
    if (markerMatch) {
        const marker = markerMatch[1];
        const rest = markerMatch[2].trim();
        if (!rest) return marker;
        return `${marker} $${rest}$`;
    }

    return `$${trimmed}$`;
}

function sanitizeRenderableText(input: string): string {
    return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

function asStringArrayFromAsset(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map(String).map((v) => v.trim()).filter(Boolean);
    }

    if (value && typeof value === "object") {
        const obj = value as Record<string, unknown>;
        const candidates = [obj.urls, obj.imageUrls, obj.images, obj.url, obj.src];
        const out: string[] = [];
        for (const c of candidates) {
            if (typeof c === "string" && c.trim()) out.push(c.trim());
            if (Array.isArray(c)) {
                for (const item of c) {
                    const s = String(item).trim();
                    if (s) out.push(s);
                }
            }
        }
        return Array.from(new Set(out));
    }

    if (typeof value === "string") {
        const s = value.trim();
        if (!s) return [];
        return s.split(/\r?\n|,|;/g).map((x) => x.trim()).filter(Boolean);
    }

    return [];
}

function answerToKeys(value: unknown): string[] {
    if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
    if (typeof value === "string") {
        const s = value.trim();
        return s ? [s] : [];
    }
    if (typeof value === "number") return [String(value)];
    return [];
}

function formatAnswerValue(value: unknown): string {
    if (value == null) return "-";
    if (Array.isArray(value)) {
        const out = value.map((v) => String(v).trim()).filter(Boolean);
        return out.length ? out.join(", ") : "-";
    }
    if (typeof value === "string") return value.trim() || "-";
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function fmt(seconds: number) {
    const mm = Math.floor(seconds / 60);
    const ss = seconds % 60;
    return `${mm}m ${ss}s`;
}

function fmtCompact(seconds: number) {
    const mm = Math.floor(seconds / 60);
    const ss = seconds % 60;
    return mm > 0 ? `${mm}m ${ss}s` : `${ss}s`;
}

export function AdvanceV2ReportClient({ attemptId }: { attemptId: string }) {
    const [data, setData] = useState<Payload | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [redirecting, setRedirecting] = useState(false);
    const [attemptNo, setAttemptNo] = useState(0);
    const [exporting, setExporting] = useState(false);
    const [exportMsg, setExportMsg] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        let intervalId: ReturnType<typeof setInterval> | null = null;

        const fetchLatest = async () => {
            const res = await apiGet<Payload>(`/api/v2/attempts/${attemptId}/report`);
            if (cancelled) return;
            setData(res);
            setError(null);
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
                    const res = await apiGet<Payload>(`/api/v2/attempts/${attemptId}/report`);
                    if (cancelled) return;

                    setData(res);
                    setError(null);

                    if (res.attempt.status === "IN_PROGRESS") {
                        intervalId = setInterval(() => {
                            void fetchLatest().catch((err) => {
                                const msg = err instanceof Error ? err.message : "Failed to refresh report";
                                if (msg.startsWith("401")) {
                                    setRedirecting(true);
                                    window.location.href = "/login";
                                }
                            });
                        }, 5000);
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

    const flatQuestions = useMemo<FlatQuestion[]>(() => {
        let index = 0;
        const out: FlatQuestion[] = [];
        for (const subject of data?.subjectBreakdown ?? []) {
            for (const section of subject.sections) {
                for (const q of section.questions) {
                    index += 1;
                    out.push({
                        index,
                        subject: subject.subject,
                        sectionCode: section.sectionCode,
                        sectionTitle: section.title,
                        ...q,
                    });
                }
            }
        }
        return out;
    }, [data]);

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
                    {redirecting ? "Redirecting..." : `Generating report... (${attemptNo}/12)`}
                </div>
            </div>
        );
    }

    const progressPercent = data.summary.totalQuestions > 0
        ? Math.round((data.summary.attempted / data.summary.totalQuestions) * 100)
        : 0;

    const weakSections = (data.analytics?.topicAccuracy ?? data.subjectBreakdown
        .flatMap((subject) =>
            subject.sections.map((section) => {
                const total = section.questions.length;
                const accuracy = total > 0 ? section.correct / total : 0;
                return {
                    topic: `${subject.subject} - ${formatSectionLabel(section.sectionCode)}: ${section.title}`,
                    accuracy,
                    correct: section.correct,
                    total,
                };
            }),
        )
        .sort((a, b) => a.accuracy - b.accuracy))
        .slice(0, 8)
        .map((item) => ({
            key: item.topic,
            label: item.topic,
            accuracy: item.accuracy,
            correct: item.correct,
            total: item.total,
        }));

    function exportReportPdf() {
        if (exporting) return;
        setExporting(true);
        setExportMsg(null);
        try {
            window.print();
            setExportMsg("Print dialog opened. Choose Save as PDF.");
        } catch {
            setExportMsg("Failed to export PDF.");
        } finally {
            setExporting(false);
        }
    }

    return (
        <MathJaxContext config={mathjaxConfig}>
            <div className="min-h-screen flex flex-col">
                <header
                    className="sticky top-0 z-50 border-b backdrop-blur-md"
                    style={{
                        borderColor: "var(--border)",
                        background: "color-mix(in srgb, var(--background) 88%, transparent)",
                    }}
                >
                    <div className="max-w-5xl mx-auto px-4 py-2">
                        <div className="rounded-2xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                            <div className="flex flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                                <div className="flex items-center gap-2 shrink-0">
                                    <Link
                                        href={`/advance/test/${data.exam.id}/history`}
                                        className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                    >
                                        History
                                    </Link>
                                    <Link
                                        href="/"
                                        className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                    >
                                        Home
                                    </Link>
                                    <button
                                        type="button"
                                        className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                        style={{
                                            borderColor: "rgba(59, 130, 246, 0.5)",
                                            background: "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(14,165,233,0.9))",
                                            color: "#e0f2fe",
                                        }}
                                        onClick={exportReportPdf}
                                        disabled={exporting}
                                    >
                                        {exporting ? "Preparing PDF..." : "Export PDF"}
                                    </button>
                                </div>
                                <div
                                    className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap"
                                    style={{
                                        borderColor: "rgba(59, 130, 246, 0.5)",
                                        background: "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(14,165,233,0.9))",
                                        color: "#e0f2fe",
                                    }}
                                >
                                    Attempt Report
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                <main className="max-w-5xl mx-auto w-full px-4 pt-8 pb-16">
                    <section className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                        <h1 className="text-xl sm:text-2xl font-semibold break-words">{data.exam.title}</h1>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            <span className="inline-flex items-center justify-center h-7 rounded-full border px-2.5" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                                Attempt {data.attempt.id.slice(0, 8)}
                            </span>
                            <span className="inline-flex items-center justify-center h-7 rounded-full border px-2.5" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                                Status {data.attempt.status}
                            </span>
                            <span className="inline-flex items-center justify-center h-7 rounded-full border px-2.5" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                                Started {formatDateTimeIST(data.attempt.startTimestamp)} IST
                            </span>
                            <span className="inline-flex items-center justify-center h-7 rounded-full border px-2.5" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                                Ended {formatDateTimeIST(data.attempt.submittedAt ?? data.attempt.scheduledEndAt)} IST
                            </span>
                        </div>
                        {data.attempt.studentName ? (
                            <div className="mt-1 text-xs opacity-60">Student: {data.attempt.studentName}</div>
                        ) : null}
                        {exportMsg ? <div className="mt-1 text-xs opacity-70">{exportMsg}</div> : null}

                        <div className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                            <div className="text-xs font-medium opacity-75">Overall Progress</div>
                            <div className="mt-2 h-2 w-full rounded-full" style={{ background: "rgba(148, 163, 184, 0.25)" }}>
                                <div
                                    className="h-2 rounded-full"
                                    style={{
                                        width: `${progressPercent}%`,
                                        background: "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(14,165,233,0.9))",
                                    }}
                                />
                            </div>
                            <div className="mt-2 text-xs opacity-70">
                                Attempted {data.summary.attempted}/{data.summary.totalQuestions || "-"} · Correct {data.summary.correct} · Incorrect {data.summary.incorrect}
                            </div>
                        </div>
                    </section>

                    <div className="mt-6 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-xl border p-4" style={{ borderColor: "rgba(59, 130, 246, 0.5)", background: "rgba(37,99,235,0.16)" }}>
                            <div className="text-xs opacity-70">Score</div>
                            <div className="text-2xl font-semibold">{(data.attempt.totalScore ?? data.summary.computedTotalScore).toFixed(2)}</div>
                        </div>
                        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                            <div className="text-xs opacity-70">Total Time Spent</div>
                            <div className="text-lg font-semibold">{fmt(data.analytics?.totalTimeSeconds ?? data.summary.totalTimeSpentSeconds)}</div>
                        </div>
                        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                            <div className="text-xs opacity-70">Time on Correct</div>
                            <div className="text-lg font-semibold">{fmt(data.analytics?.timeOnCorrectSeconds ?? 0)}</div>
                        </div>
                        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                            <div className="text-xs opacity-70">Time on Incorrect</div>
                            <div className="text-lg font-semibold">{fmt(data.analytics?.timeOnIncorrectSeconds ?? 0)}</div>
                        </div>
                    </div>

                    <div className="mt-8">
                        <h2 className="text-lg font-semibold">Section Summary</h2>
                        <div className="mt-3 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                            {data.subjectBreakdown.map((s) => (
                                <div key={s.subject} className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                                    <div className="font-medium">
                                        {s.subject.charAt(0) + s.subject.slice(1).toLowerCase()}
                                    </div>
                                    <div className="mt-2 text-sm opacity-80">Time: {fmt(s.timeSpentSeconds)}</div>
                                    <div className="text-sm opacity-80">Correct: {s.correct}</div>
                                    <div className="text-sm opacity-80">Incorrect: {s.incorrect}</div>
                                    <div className="text-sm opacity-80">Unattempted: {s.unattempted}</div>
                                    <div className="text-sm opacity-80">Net Score: {s.score.toFixed(2)}</div>
                                    <div className="text-sm text-red-400">Net Negative: -{(s.netNegative ?? 0).toFixed(2)}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="mt-8">
                        <h2 className="text-lg font-semibold">Weak Topics</h2>
                        <div className="mt-3 grid gap-2">
                            {weakSections.length ? weakSections.map((item) => (
                                <div key={item.key} className="rounded border p-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="font-medium min-w-0 break-words">{item.label}</div>
                                        <div className="text-sm opacity-70 shrink-0">
                                            {(item.accuracy * 100).toFixed(0)}% ({item.correct}/{item.total})
                                        </div>
                                    </div>
                                </div>
                            )) : (
                                <div className="rounded border p-3 text-sm opacity-70" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                                    No section accuracy data available yet.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mt-8">
                        <h2 className="text-lg font-semibold">Question-wise Report</h2>
                        <div className="mt-3 grid gap-4">
                            {flatQuestions.map((q) => {
                                const resultLabel = !q.attempted ? "Unattempted" : q.marksAwarded > 0 ? "Correct" : "Incorrect";
                                const resultClass = !q.attempted
                                    ? "opacity-70"
                                    : q.marksAwarded > 0
                                        ? "text-green-600"
                                        : "text-red-600";
                                const timeClass = q.timeSpentSeconds > 240
                                    ? "text-red-500 font-medium"
                                    : q.timeSpentSeconds > 180
                                        ? "text-amber-400 font-medium"
                                        : "opacity-70";

                                const questionImageUrls = asStringArrayFromAsset(q.stemAssets);
                                const parsedMatching = q.questionType === "MATCHING_LIST" ? parseMatchingStem(q.stemRich) : null;
                                const selectedKeys = answerToKeys(
                                    q.questionType === "NAT_INTEGER" || q.questionType === "NAT_DECIMAL"
                                        ? (q.numericValue != null ? q.numericValue : q.responseJson)
                                        : q.responseJson,
                                );
                                const correctKeys = answerToKeys(q.correctAnswer);

                                return (
                                    <div key={q.questionId} className="rounded-xl border p-4 shadow-sm" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div className="text-xs opacity-70 break-words">
                                                Q{q.index} · {q.subject} · {formatSectionLabel(q.sectionCode)}
                                                {q.topicName ? ` · ${q.topicName}` : ""}
                                            </div>
                                            <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
                                                <div className={`font-medium ${resultClass}`}>{resultLabel}</div>
                                                <div className={timeClass}>Time: {fmtCompact(q.timeSpentSeconds)}</div>
                                                <div className="opacity-70">Marks: {q.marksAwarded.toFixed(2)}</div>
                                            </div>
                                        </div>

                                        <div className="mt-3 text-base leading-relaxed">
                                            {questionImageUrls.length ? (
                                                <div className="mb-3 mx-auto max-w-4xl">
                                                    <ImageCarousel
                                                        imageUrls={questionImageUrls}
                                                        altBase="Report question image"
                                                        heightClass="h-64 sm:h-80"
                                                    />
                                                </div>
                                            ) : null}

                                            {q.questionType === "MATCHING_LIST" && parsedMatching ? (
                                                <div className="space-y-3">
                                                    {parsedMatching.intro.map((line, idx) => (
                                                        <div key={`intro-${q.questionId}-${idx}`}>
                                                            <MathJax dynamic>{sanitizeRenderableText(line)}</MathJax>
                                                        </div>
                                                    ))}

                                                    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
                                                        <table className="w-full min-w-[540px] border-collapse text-sm sm:text-base">
                                                            <thead>
                                                                <tr style={{ background: "var(--muted)" }}>
                                                                    <th className="w-1/2 border px-3 py-2 text-left font-semibold" style={{ borderColor: "var(--border)" }}>List-I</th>
                                                                    <th className="w-1/2 border px-3 py-2 text-left font-semibold" style={{ borderColor: "var(--border)" }}>List-II</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {Array.from({ length: Math.max(parsedMatching.listI.length, parsedMatching.listII.length) }).map((_, idx) => (
                                                                    <tr key={`row-${q.questionId}-${idx}`}>
                                                                        <td className="align-top border px-3 py-2" style={{ borderColor: "var(--border)" }}>
                                                                            {parsedMatching.listI[idx]
                                                                                ? <MathJax dynamic>{sanitizeRenderableText(normalizeMatchingLineForMathJax(parsedMatching.listI[idx]))}</MathJax>
                                                                                : null}
                                                                        </td>
                                                                        <td className="align-top border px-3 py-2" style={{ borderColor: "var(--border)" }}>
                                                                            {parsedMatching.listII[idx]
                                                                                ? <MathJax dynamic>{sanitizeRenderableText(normalizeMatchingLineForMathJax(parsedMatching.listII[idx]))}</MathJax>
                                                                                : null}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>

                                                    {parsedMatching.outro.map((line, idx) => (
                                                        <div key={`outro-${q.questionId}-${idx}`}>
                                                            <MathJax dynamic>{sanitizeRenderableText(line)}</MathJax>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <MathJax dynamic>{sanitizeRenderableText(q.stemRich)}</MathJax>
                                            )}
                                        </div>

                                        {q.options?.length ? (
                                            <div className="mt-4 grid gap-2">
                                                {q.options.map((o) => {
                                                    const selected = selectedKeys.includes(o.optionKey);
                                                    const correct = correctKeys.includes(o.optionKey) || Boolean(o.isCorrect);
                                                    const optionImageUrls = asStringArrayFromAsset(o.assets);

                                                    return (
                                                        <div
                                                            key={`${q.questionId}-${o.optionKey}`}
                                                            className="rounded border p-3"
                                                            style={{
                                                                borderColor: correct
                                                                    ? "rgba(16,185,129,0.5)"
                                                                    : selected
                                                                        ? "rgba(59,130,246,0.45)"
                                                                        : "var(--border)",
                                                                background: correct
                                                                    ? "rgba(16,185,129,0.12)"
                                                                    : selected
                                                                        ? "rgba(59,130,246,0.1)"
                                                                        : "var(--card)",
                                                            }}
                                                        >
                                                            <div className="flex items-start gap-3">
                                                                <div className="mt-0.5 text-xs font-mono opacity-70">{o.optionKey}.</div>
                                                                <div className="text-sm leading-relaxed min-w-0">
                                                                    <MathJax dynamic>{sanitizeRenderableText(o.labelRich)}</MathJax>

                                                                    {optionImageUrls.length ? (
                                                                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                                                            {optionImageUrls.map((url) => (
                                                                                <div
                                                                                    key={`${q.questionId}-${o.optionKey}-${url}`}
                                                                                    className="rounded border p-2 flex items-center justify-center w-full h-40 sm:h-48"
                                                                                    style={{
                                                                                        borderColor: "var(--border)",
                                                                                        background: "var(--card)",
                                                                                    }}
                                                                                >
                                                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                                    <img
                                                                                        src={optimizeImageDelivery(url)}
                                                                                        alt={`Option ${o.optionKey}`}
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
                                                <span className="opacity-70">Marked answer:</span>{" "}
                                                {formatAnswerValue(
                                                    q.questionType === "NAT_INTEGER" || q.questionType === "NAT_DECIMAL"
                                                        ? (q.numericValue != null ? q.numericValue : q.responseJson)
                                                        : q.responseJson,
                                                )}
                                            </div>
                                            <div>
                                                <span className="opacity-70">Correct answer:</span> {formatAnswerValue(q.correctAnswer)}
                                            </div>
                                            <div>
                                                <span className="opacity-70">Section:</span> {formatSectionLabel(q.sectionCode)} · {q.sectionTitle}
                                            </div>
                                        </div>
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
