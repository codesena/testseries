"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MathJax, MathJaxContext } from "better-react-mathjax";
import { apiGet, apiPost } from "@/lib/api";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RichStemContent } from "@/components/common/RichStemContent";

type V2Question = {
    questionId: string;
    questionType: "SINGLE_CORRECT" | "MULTI_CORRECT" | "MATCHING_LIST" | "NAT_INTEGER" | "NAT_DECIMAL";
    stemRich: string;
    topicName?: string | null;
    options: Array<{ optionKey: string; labelRich: string }>;
    responseJson: unknown;
    numericValue: number | null;
    answerState?: QuestionStatus;
    timeSpentSeconds?: number;
};

type V2AttemptPayload = {
    attempt: {
        id: string;
        status: string;
        scheduledEndAt: string;
    };
    exam: {
        title: string;
    };
    subjectBreakdown: Array<{
        subject: string;
        sections: Array<{
            sectionCode: string;
            title: string;
            questions: V2Question[];
        }>;
    }>;
};

type QuestionStatus =
    | "NOT_VISITED"
    | "VISITED_NOT_ANSWERED"
    | "ANSWERED_SAVED"
    | "MARKED_FOR_REVIEW"
    | "ANSWERED_MARKED_FOR_REVIEW";

type FlatQuestion = {
    questionId: string;
    questionType: V2Question["questionType"];
    stemRich: string;
    topicName: string | null;
    options: V2Question["options"];
    subject: string;
    sectionCode: string;
    sectionTitle: string;
};

type QuestionTypeKey = V2Question["questionType"];

const mathjaxConfig = {
    loader: { load: ["[tex]/mhchem"] },
    tex: {
        packages: { "[+]": ["mhchem"] },
        inlineMath: [["$", "$"], ["\\(", "\\)"]],
        displayMath: [["$$", "$$"], ["\\[", "\\]"]],
    },
} as const;

function formatTimeLeft(scheduledEndAt: string): string {
    const leftMs = new Date(scheduledEndAt).getTime() - Date.now();
    const left = Math.max(0, Math.floor(leftMs / 1000));
    const hh = Math.floor(left / 3600);
    const mm = Math.floor((left % 3600) / 60);
    const ss = left % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function hasAnswer(value: unknown): boolean {
    if (value == null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "string") return value.trim().length > 0;
    return true;
}

function statusTone(status: QuestionStatus) {
    if (status === "VISITED_NOT_ANSWERED") return "bg-amber-300 text-amber-950";
    if (status === "ANSWERED_SAVED") return "bg-emerald-400 text-emerald-950";
    if (status === "MARKED_FOR_REVIEW") return "bg-violet-400 text-violet-950";
    if (status === "ANSWERED_MARKED_FOR_REVIEW") return "bg-violet-700 text-white";
    return "bg-[var(--muted)] text-[var(--foreground)]";
}

function statusLabel(status: QuestionStatus) {
    if (status === "VISITED_NOT_ANSWERED") return "Visited";
    if (status === "ANSWERED_SAVED") return "Answered";
    if (status === "MARKED_FOR_REVIEW") return "Marked";
    if (status === "ANSWERED_MARKED_FOR_REVIEW") return "Answered + Marked";
    return "Not visited";
}

function subjectTone(subject: string) {
    const s = subject.toLowerCase();
    if (s.includes("phys")) return "bg-sky-600/80 text-sky-50";
    if (s.includes("chem")) return "bg-emerald-600/80 text-emerald-50";
    return "bg-amber-500/85 text-amber-950";
}

function formatSectionLabel(sectionCode: string) {
    const raw = String(sectionCode || "").trim();
    if (!raw) return "Section";
    const suffix = raw.includes("-") ? raw.split("-").pop() ?? raw : raw;
    return `Section-${suffix.toUpperCase()}`;
}

function questionTypeLabel(type: QuestionTypeKey) {
    if (type === "SINGLE_CORRECT") return "Single Correct";
    if (type === "MULTI_CORRECT") return "Multi Correct";
    if (type === "MATCHING_LIST") return "Matching List";
    if (type === "NAT_INTEGER") return "NAT Integer";
    return "NAT Decimal";
}

function questionTypeOrder(type: QuestionTypeKey) {
    if (type === "SINGLE_CORRECT") return 1;
    if (type === "MULTI_CORRECT") return 2;
    if (type === "MATCHING_LIST") return 3;
    if (type === "NAT_INTEGER") return 4;
    return 5;
}

type ParsedMatchingStem = {
    intro: string[];
    listI: string[];
    listII: string[];
    outro: string[];
};

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
    // Remove hidden control chars from pasted content that can render as square boxes.
    return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

function clearTextSelection() {
    if (typeof window === "undefined") return;
    const sel = window.getSelection?.();
    if (sel && sel.rangeCount > 0) {
        sel.removeAllRanges();
    }
}

export function AdvanceV2ExamClient({ attemptId }: { attemptId: string }) {
    const [data, setData] = useState<V2AttemptPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
    const [activeSubject, setActiveSubject] = useState<string | null>(null);
    const [activeQuestionType, setActiveQuestionType] = useState<QuestionTypeKey | null>(null);
    const [answersByQid, setAnswersByQid] = useState<Record<string, unknown>>({});
    const [statusByQid, setStatusByQid] = useState<Record<string, QuestionStatus>>({});
    const [saving, setSaving] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [timeLabel, setTimeLabel] = useState<string>("--:--");
    const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
    const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
    const [saveNextNotice, setSaveNextNotice] = useState<string | null>(null);
    const [baseTimeByQid, setBaseTimeByQid] = useState<Record<string, number>>({});
    const activeEnteredAtRef = useRef<number | null>(null);

    const load = async () => {
        const res = await apiGet<V2AttemptPayload>(`/api/v2/attempts/${attemptId}/report`);
        setData(res);
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                await load();
            } catch (e) {
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : "Failed to load");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [attemptId]);

    useEffect(() => {
        if (!data) return;
        setTimeLabel(formatTimeLeft(data.attempt.scheduledEndAt));
        const timer = window.setInterval(() => {
            setTimeLabel(formatTimeLeft(data.attempt.scheduledEndAt));
        }, 1000);
        return () => window.clearInterval(timer);
    }, [data]);

    const questions = useMemo<FlatQuestion[]>(() => {
        if (!data) return [];
        return data.subjectBreakdown.flatMap((subject) =>
            subject.sections.flatMap((section) =>
                section.questions.map((question) => ({
                    questionId: question.questionId,
                    questionType: question.questionType,
                    stemRich: question.stemRich,
                    topicName: question.topicName ?? null,
                    options: question.options,
                    subject: subject.subject,
                    sectionCode: section.sectionCode,
                    sectionTitle: section.title,
                })),
            ),
        );
    }, [data]);

    const subjects = useMemo(() => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const q of questions) {
            if (seen.has(q.subject)) continue;
            seen.add(q.subject);
            out.push(q.subject);
        }
        return out;
    }, [questions]);

    useEffect(() => {
        if (!data) return;

        const nextAnswers: Record<string, unknown> = {};
        const nextStatus: Record<string, QuestionStatus> = {};
        const nextTime: Record<string, number> = {};

        for (const subject of data.subjectBreakdown) {
            for (const section of subject.sections) {
                for (const q of section.questions) {
                    nextAnswers[q.questionId] = q.questionType === "NAT_INTEGER" || q.questionType === "NAT_DECIMAL"
                        ? (q.numericValue != null ? String(q.numericValue) : q.responseJson)
                        : q.responseJson;
                    nextStatus[q.questionId] = q.answerState ?? "NOT_VISITED";
                    nextTime[q.questionId] = Number.isFinite(q.timeSpentSeconds) ? Number(q.timeSpentSeconds) : 0;
                }
            }
        }

        setAnswersByQid(nextAnswers);
        setStatusByQid(nextStatus);
        setBaseTimeByQid(nextTime);

        const firstQuestion = questions[0]?.questionId ?? null;
        setActiveQuestionId((prev) => prev && nextAnswers[prev] !== undefined ? prev : firstQuestion);
        setActiveSubject((prev) => prev && subjects.includes(prev) ? prev : subjects[0] ?? null);
    }, [data, questions, subjects]);

    useEffect(() => {
        if (!activeQuestionId) return;
        activeEnteredAtRef.current = Date.now();
    }, [activeQuestionId]);

    function currentElapsedSecondsForActiveQuestion() {
        if (!activeQuestionId) return 0;
        if (activeEnteredAtRef.current == null) return 0;
        const elapsed = Math.floor((Date.now() - activeEnteredAtRef.current) / 1000);
        return Math.max(0, elapsed);
    }

    function computeAndSealTimeForQuestion(questionId: string): number {
        const base = baseTimeByQid[questionId] ?? 0;
        if (questionId !== activeQuestionId) return base;

        const elapsed = currentElapsedSecondsForActiveQuestion();
        const total = base + elapsed;
        setBaseTimeByQid((prev) => ({ ...prev, [questionId]: total }));
        activeEnteredAtRef.current = Date.now();
        return total;
    }

    function commitCurrentQuestionTime() {
        if (!activeQuestionId) return;
        void computeAndSealTimeForQuestion(activeQuestionId);
    }

    const filteredQuestions = useMemo(() => {
        if (!activeSubject) return questions;
        return questions.filter((q) => q.subject === activeSubject);
    }, [questions, activeSubject]);

    const filteredQuestionsByType = useMemo(() => {
        if (!activeQuestionType) return filteredQuestions;
        return filteredQuestions.filter((q) => q.questionType === activeQuestionType);
    }, [filteredQuestions, activeQuestionType]);

    const subjectQuestionNoByQid = useMemo(() => {
        const out: Record<string, number> = {};
        filteredQuestions.forEach((q, idx) => {
            out[q.questionId] = idx + 1;
        });
        return out;
    }, [filteredQuestions]);

    const questionTypeCapsules = useMemo(() => {
        const bucket = new Map<QuestionTypeKey, { count: number; firstNo: number }>();
        for (const q of filteredQuestions) {
            const no = subjectQuestionNoByQid[q.questionId] ?? Number.MAX_SAFE_INTEGER;
            const existing = bucket.get(q.questionType);
            if (!existing) {
                bucket.set(q.questionType, { count: 1, firstNo: no });
            } else {
                bucket.set(q.questionType, {
                    count: existing.count + 1,
                    firstNo: Math.min(existing.firstNo, no),
                });
            }
        }

        return Array.from(bucket.entries())
            .map(([type, meta]) => ({ type, count: meta.count, firstNo: meta.firstNo }))
            .sort((a, b) => {
                const byType = questionTypeOrder(a.type) - questionTypeOrder(b.type);
                if (byType !== 0) return byType;
                return a.firstNo - b.firstNo;
            });
    }, [filteredQuestions, subjectQuestionNoByQid]);

    useEffect(() => {
        if (!questionTypeCapsules.length) {
            setActiveQuestionType(null);
            return;
        }

        setActiveQuestionType((prev) => {
            const allowed = questionTypeCapsules.map((c) => c.type);
            if (prev && allowed.includes(prev)) return prev;

            const activeQType = filteredQuestions.find((q) => q.questionId === activeQuestionId)?.questionType;
            if (activeQType && allowed.includes(activeQType)) return activeQType;

            return questionTypeCapsules[0].type;
        });
    }, [questionTypeCapsules, filteredQuestions, activeQuestionId]);

    const activeQuestion = useMemo(
        () => questions.find((question) => question.questionId === activeQuestionId) ?? null,
        [questions, activeQuestionId],
    );

    const parsedMatchingStem = useMemo(() => {
        if (!activeQuestion || activeQuestion.questionType !== "MATCHING_LIST") return null;
        return parseMatchingStem(activeQuestion.stemRich);
    }, [activeQuestion]);

    const activeIndex = useMemo(
        () => questions.findIndex((question) => question.questionId === activeQuestionId),
        [questions, activeQuestionId],
    );

    const answeredCount = useMemo(
        () => Object.values(statusByQid).filter((s) => s === "ANSWERED_SAVED" || s === "ANSWERED_MARKED_FOR_REVIEW").length,
        [statusByQid],
    );

    const markedCount = useMemo(
        () => Object.values(statusByQid).filter((s) => s === "MARKED_FOR_REVIEW" || s === "ANSWERED_MARKED_FOR_REVIEW").length,
        [statusByQid],
    );

    const progressPercent = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0;

    if (loading) return <div className="p-6">Loading advanced attempt...</div>;
    if (error) return <div className="p-6 text-red-600">{error}</div>;
    if (!data || !activeQuestion) return <div className="p-6">No questions found.</div>;

    const selectedArray = Array.isArray(answersByQid[activeQuestion.questionId])
        ? (answersByQid[activeQuestion.questionId] as unknown[]).map(String)
        : [];
    const selectedSingle = typeof answersByQid[activeQuestion.questionId] === "string" ? String(answersByQid[activeQuestion.questionId]) : "";
    const numericValue = typeof answersByQid[activeQuestion.questionId] === "string" ? String(answersByQid[activeQuestion.questionId]) : "";

    const markVisitedIfNeeded = () => {
        setStatusByQid((prev) => ({
            ...prev,
            [activeQuestion.questionId]: prev[activeQuestion.questionId] === "NOT_VISITED"
                ? "VISITED_NOT_ANSWERED"
                : (prev[activeQuestion.questionId] ?? "VISITED_NOT_ANSWERED"),
        }));
    };

    const selectSingleLikeOption = (optionKey: string) => {
        clearTextSelection();
        setAnswersByQid((prev) => ({ ...prev, [activeQuestion.questionId]: optionKey }));
        markVisitedIfNeeded();
    };

    const toggleMultiOption = (optionKey: string) => {
        clearTextSelection();
        const checked = selectedArray.includes(optionKey);
        const next = checked
            ? selectedArray.filter((k) => k !== optionKey)
            : [...selectedArray, optionKey];
        setAnswersByQid((prev) => ({ ...prev, [activeQuestion.questionId]: next }));
        markVisitedIfNeeded();
    };

    const pushResponse = async (questionId: string, status: QuestionStatus, explicitValue?: unknown) => {
        const value = explicitValue !== undefined ? explicitValue : answersByQid[questionId];
        const question = questions.find((q) => q.questionId === questionId);
        if (!question) return;

        let responseJson: unknown = value;
        let numericPayload: number | undefined;

        if (question.questionType === "NAT_INTEGER" || question.questionType === "NAT_DECIMAL") {
            const raw = typeof value === "string" ? value.trim() : "";
            if (!raw) {
                responseJson = undefined;
                numericPayload = undefined;
            } else {
                const parsed = Number(raw);
                if (Number.isFinite(parsed)) {
                    responseJson = parsed;
                    numericPayload = parsed;
                } else {
                    responseJson = undefined;
                    numericPayload = undefined;
                }
            }
        }

        const timeSpentSeconds = computeAndSealTimeForQuestion(questionId);

        await apiPost(`/api/v2/attempts/${attemptId}/responses`, {
            questionId,
            responseJson,
            numericValue: numericPayload,
            answerState: status,
            timeSpentSeconds,
        });
    };

    const goToQuestion = (questionId: string) => {
        commitCurrentQuestionTime();
        setActiveQuestionId(questionId);
        setStatusByQid((prev) => ({
            ...prev,
            [questionId]: prev[questionId] === "NOT_VISITED" ? "VISITED_NOT_ANSWERED" : (prev[questionId] ?? "VISITED_NOT_ANSWERED"),
        }));
        setSaveNextNotice(null);
    };

    const goNext = () => {
        const list = activeSubject ? filteredQuestions : questions;
        const idx = list.findIndex((q) => q.questionId === activeQuestionId);
        const next = list[idx + 1];
        if (next) {
            setActiveQuestionType(next.questionType);
            goToQuestion(next.questionId);
            return;
        }

        if (!activeSubject) return;
        const subIdx = subjects.findIndex((s) => s === activeSubject);
        const nextSubject = subjects[subIdx + 1];
        if (!nextSubject) return;

        const first = questions.find((q) => q.subject === nextSubject);
        if (first) {
            setActiveSubject(nextSubject);
            setActiveQuestionType(first.questionType);
            goToQuestion(first.questionId);
        }
    };

    const goPrev = () => {
        const list = activeSubject ? filteredQuestions : questions;
        const idx = list.findIndex((q) => q.questionId === activeQuestionId);
        const prev = list[idx - 1];
        if (prev) {
            setActiveQuestionType(prev.questionType);
            goToQuestion(prev.questionId);
        }
    };

    const saveAndNext = async () => {
        if (!activeQuestionId) return;
        const value = answersByQid[activeQuestionId];
        const answered = hasAnswer(value);
        if (!answered) {
            setSaveNextNotice("Please select an option before Save & Next. If you want to skip, use Mark for Review & Next.");
            return;
        }

        setSaving(true);
        setSaveNextNotice(null);
        const nextStatus: QuestionStatus = "ANSWERED_SAVED";
        try {
            await pushResponse(activeQuestionId, nextStatus);
            setStatusByQid((prev) => ({ ...prev, [activeQuestionId]: nextStatus }));
            goNext();
        } finally {
            setSaving(false);
        }
    };

    const markForReviewAndNext = async () => {
        if (!activeQuestionId) return;

        setSaving(true);
        const answered = hasAnswer(answersByQid[activeQuestionId]);
        const nextStatus: QuestionStatus = answered ? "ANSWERED_MARKED_FOR_REVIEW" : "MARKED_FOR_REVIEW";
        try {
            await pushResponse(activeQuestionId, nextStatus);
            setStatusByQid((prev) => ({ ...prev, [activeQuestionId]: nextStatus }));
            goNext();
        } finally {
            setSaving(false);
        }
    };

    const clearResponse = async () => {
        if (!activeQuestionId) return;
        setSaving(true);
        try {
            const clearedValue = "";
            setAnswersByQid((prev) => ({ ...prev, [activeQuestionId]: clearedValue }));
            const nextStatus: QuestionStatus = "VISITED_NOT_ANSWERED";
            await pushResponse(activeQuestionId, nextStatus, clearedValue);
            setStatusByQid((prev) => ({ ...prev, [activeQuestionId]: nextStatus }));
        } finally {
            setSaving(false);
        }
    };

    const nextWithAutoSave = async () => {
        if (!activeQuestionId) {
            goNext();
            return;
        }

        const answered = hasAnswer(answersByQid[activeQuestionId]);
        if (answered) {
            setSaving(true);
            try {
                const nextStatus: QuestionStatus = "ANSWERED_SAVED";
                await pushResponse(activeQuestionId, nextStatus);
                setStatusByQid((prev) => ({ ...prev, [activeQuestionId]: nextStatus }));
            } finally {
                setSaving(false);
            }
        }
        setSaveNextNotice(null);
        goNext();
    };

    const paletteContent = (
        <>
            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                <div className="font-medium">Question Palette</div>
                <div className="mt-2 h-2 w-full rounded-full" style={{ background: "rgba(148, 163, 184, 0.25)" }}>
                    <div
                        className="h-2 rounded-full"
                        style={{
                            width: `${progressPercent}%`,
                            background: "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(14,165,233,0.9))",
                        }}
                    />
                </div>
                <div className="mt-2 text-xs opacity-70">Progress {progressPercent}% · Marked {markedCount}</div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
                {subjects.map((subject) => {
                    const active = activeSubject === subject;
                    return (
                        <button
                            key={subject}
                            className={`inline-flex w-full items-center justify-center h-9 rounded-full border px-2 text-xs whitespace-nowrap ui-click transition-colors ${active
                                ? `font-semibold ring-2 ring-white/35 ${subjectTone(subject)}`
                                : "opacity-85 bg-[var(--muted)] text-[var(--foreground)] hover:opacity-100"
                                }`}
                            style={{ borderColor: "var(--border)" }}
                            onClick={() => {
                                setActiveSubject(subject);
                                const first = questions.find((q) => q.subject === subject);
                                if (first) {
                                    setActiveQuestionType(first.questionType);
                                    goToQuestion(first.questionId);
                                    setMobilePanelOpen(false);
                                }
                            }}
                        >
                            {subject}
                        </button>
                    );
                })}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
                {questionTypeCapsules.map(({ type, count }) => {
                    const active = activeQuestionType === type;
                    return (
                        <button
                            key={type}
                            className={`inline-flex w-full items-center justify-center h-9 rounded-full border px-2 text-[11px] whitespace-nowrap ui-click transition-colors ${active
                                ? "font-semibold bg-sky-600/80 text-sky-50 ring-2 ring-white/35"
                                : "opacity-90 bg-[var(--muted)] text-[var(--foreground)] hover:opacity-100"
                                }`}
                            style={{ borderColor: "var(--border)" }}
                            onClick={() => {
                                setActiveQuestionType(type);
                                const first = filteredQuestions.find((q) => q.questionType === type);
                                if (first) {
                                    goToQuestion(first.questionId);
                                    setMobilePanelOpen(false);
                                }
                            }}
                        >
                            {questionTypeLabel(type)} ({count})
                        </button>
                    );
                })}
            </div>

            <div className="mt-4 grid grid-cols-5 gap-2">
                {filteredQuestionsByType.map((q, idx) => {
                    const status = statusByQid[q.questionId] ?? "NOT_VISITED";
                    const active = q.questionId === activeQuestionId;
                    const displayNo = subjectQuestionNoByQid[q.questionId] ?? (idx + 1);
                    return (
                        <button
                            key={q.questionId}
                            type="button"
                            onClick={() => {
                                goToQuestion(q.questionId);
                                setMobilePanelOpen(false);
                            }}
                            className={`rounded-lg border aspect-square text-xs sm:text-sm flex items-center justify-center ui-click ${statusTone(status)} ${active ? "ring-2 ring-sky-500/75" : ""}`}
                            style={{ borderColor: "var(--border)" }}
                            title={`Q${displayNo}`}
                        >
                            {displayNo}
                        </button>
                    );
                })}
            </div>

            <div className="mt-4 text-xs opacity-75">
                <div className="grid grid-cols-2 gap-2">
                    <div className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                        <span className="inline-block w-2.5 h-2.5 rounded border" style={{ background: "var(--muted)", borderColor: "var(--border)" }} />
                        Not visited
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                        <span className="inline-block w-2.5 h-2.5 rounded bg-amber-300 border" /> Visited
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                        <span className="inline-block w-2.5 h-2.5 rounded bg-emerald-400 border" /> Answered
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                        <span className="inline-block w-2.5 h-2.5 rounded bg-violet-400 border" /> Marked
                    </div>
                </div>
            </div>
        </>
    );

    return (
        <MathJaxContext config={mathjaxConfig}>
            <div className="min-h-screen flex flex-col">
                <header
                    className="sticky top-0 z-50 shrink-0 border-b backdrop-blur-md"
                    style={{
                        borderColor: "var(--border)",
                        background: "color-mix(in srgb, var(--background) 88%, transparent)",
                    }}
                >
                    <div className="max-w-[1400px] mx-auto px-4 py-2">
                        <div className="rounded-2xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div className="min-w-0 sm:flex-1">
                                    <div className="text-lg font-semibold truncate">{data.exam.title}</div>
                                    <div className="mt-1 flex sm:hidden items-center gap-2 text-[11px] opacity-75">
                                        <span>Q{subjectQuestionNoByQid[activeQuestion.questionId] ?? (activeIndex + 1)}</span>
                                        <span>•</span>
                                        <span>{answeredCount}/{questions.length} answered</span>
                                    </div>
                                    <div className="mt-1 hidden sm:flex flex-wrap items-center gap-2 text-[11px]">
                                        <span className="inline-flex items-center justify-center h-6 rounded-full border px-2.5" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                                            Attempt {attemptId.slice(0, 8)}
                                        </span>
                                        <span className="inline-flex items-center justify-center h-6 rounded-full border px-2.5" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                                            Answered {answeredCount}/{questions.length || "-"}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center flex-wrap justify-end gap-2 sm:gap-3 self-start sm:self-auto shrink-0 max-w-full">
                                    <div
                                        className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs sm:text-sm font-mono shrink-0 whitespace-nowrap"
                                        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                    >
                                        ⏱ {timeLabel}
                                    </div>
                                    <ThemeToggle />
                                    <button
                                        className="sm:hidden inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs ui-click shrink-0 whitespace-nowrap"
                                        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                        onClick={() => setMobilePanelOpen(true)}
                                        type="button"
                                    >
                                        Menu
                                    </button>
                                    <button
                                        className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs font-medium ui-click shrink-0 whitespace-nowrap"
                                        style={{
                                            borderColor: "rgba(245, 158, 11, 0.55)",
                                            background: "rgba(146, 64, 14, 0.22)",
                                            color: "#fde68a",
                                        }}
                                        onClick={() => setSubmitConfirmOpen(true)}
                                        disabled={submitting || submitConfirmOpen}
                                    >
                                        Submit
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                <div className={`flex-1 transition ${submitConfirmOpen ? "blur-sm pointer-events-none select-none" : ""}`}>
                    <div className="max-w-[1400px] mx-auto w-full px-4 py-4">
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px] lg:items-start">
                            <main className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                                <div className="rounded-xl border p-4 shadow-sm" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                                    <div className="text-[11px] uppercase tracking-wide opacity-60">
                                        {formatSectionLabel(activeQuestion.sectionCode)}
                                        {activeQuestion.topicName ? ` • ${activeQuestion.topicName}` : ""}
                                    </div>
                                    <div className="mt-2 grid grid-cols-3 gap-2">
                                        <span
                                            className="inline-flex items-center justify-center rounded-full h-7 px-1.5 text-[11px] font-medium whitespace-nowrap"
                                            style={{ borderColor: "var(--border)", background: "var(--muted)", borderWidth: 1 }}
                                        >
                                            Q{subjectQuestionNoByQid[activeQuestion.questionId] ?? (activeIndex + 1)}
                                        </span>
                                        <span
                                            className={`inline-flex items-center justify-center rounded-full h-7 px-1.5 text-[11px] font-medium whitespace-nowrap ${statusTone(statusByQid[activeQuestion.questionId] ?? "NOT_VISITED")}`}
                                        >
                                            {statusLabel(statusByQid[activeQuestion.questionId] ?? "NOT_VISITED")}
                                        </span>
                                        <span
                                            className="inline-flex items-center justify-center rounded-full h-7 px-1.5 text-[11px] font-medium whitespace-nowrap"
                                            style={{ borderColor: "var(--border)", background: "transparent", borderWidth: 1 }}
                                        >
                                            {activeQuestion.questionType}
                                        </span>
                                    </div>

                                    <div className="mt-4 text-base whitespace-pre-wrap leading-relaxed">
                                        {activeQuestion.questionType === "MATCHING_LIST" && parsedMatchingStem ? (
                                            <div className="space-y-3">
                                                {parsedMatchingStem.intro.map((line, idx) => (
                                                    <div key={`intro-${idx}`}>
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
                                                            {Array.from({ length: Math.max(parsedMatchingStem.listI.length, parsedMatchingStem.listII.length) }).map((_, idx) => (
                                                                <tr key={`row-${idx}`}>
                                                                    <td className="align-top border px-3 py-2" style={{ borderColor: "var(--border)" }}>
                                                                        {parsedMatchingStem.listI[idx]
                                                                            ? <MathJax dynamic>{sanitizeRenderableText(normalizeMatchingLineForMathJax(parsedMatchingStem.listI[idx]))}</MathJax>
                                                                            : null}
                                                                    </td>
                                                                    <td className="align-top border px-3 py-2" style={{ borderColor: "var(--border)" }}>
                                                                        {parsedMatchingStem.listII[idx]
                                                                            ? <MathJax dynamic>{sanitizeRenderableText(normalizeMatchingLineForMathJax(parsedMatchingStem.listII[idx]))}</MathJax>
                                                                            : null}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                {parsedMatchingStem.outro.map((line, idx) => (
                                                    <div key={`outro-${idx}`}>
                                                        <MathJax dynamic>{sanitizeRenderableText(line)}</MathJax>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <RichStemContent text={activeQuestion.stemRich} />
                                        )}
                                    </div>

                                    <div className="mt-5 grid gap-2">
                                        {(activeQuestion.questionType === "SINGLE_CORRECT" || activeQuestion.questionType === "MATCHING_LIST")
                                            ? activeQuestion.options.map((opt) => (
                                                <button
                                                    type="button"
                                                    key={opt.optionKey}
                                                    className={`w-full rounded border p-3 cursor-pointer ui-click text-left select-none ${selectedSingle === opt.optionKey ? "bg-[var(--muted)]" : "bg-transparent"}`}
                                                    style={{ borderColor: "var(--border)", userSelect: "none", WebkitUserSelect: "none" }}
                                                    onMouseDown={(e) => e.preventDefault()}
                                                    onPointerDown={(e) => e.preventDefault()}
                                                    onClick={() => selectSingleLikeOption(opt.optionKey)}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <input
                                                            type="radio"
                                                            name={`single-like-${activeQuestion.questionId}`}
                                                            checked={selectedSingle === opt.optionKey}
                                                            readOnly
                                                            className="pointer-events-none"
                                                        />
                                                        <span style={{ userSelect: "none", WebkitUserSelect: "none" }}>
                                                            {opt.optionKey}. <MathJax inline dynamic>{sanitizeRenderableText(opt.labelRich)}</MathJax>
                                                        </span>
                                                    </div>
                                                </button>
                                            ))
                                            : null}

                                        {activeQuestion.questionType === "MULTI_CORRECT"
                                            ? activeQuestion.options.map((opt) => {
                                                const checked = selectedArray.includes(opt.optionKey);
                                                return (
                                                    <button
                                                        type="button"
                                                        key={opt.optionKey}
                                                        className={`w-full rounded border p-3 cursor-pointer ui-click text-left select-none ${checked ? "bg-[var(--muted)]" : "bg-transparent"}`}
                                                        style={{ borderColor: "var(--border)", userSelect: "none", WebkitUserSelect: "none" }}
                                                        onMouseDown={(e) => e.preventDefault()}
                                                        onPointerDown={(e) => e.preventDefault()}
                                                        onClick={() => toggleMultiOption(opt.optionKey)}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                readOnly
                                                                className="pointer-events-none"
                                                            />
                                                            <span style={{ userSelect: "none", WebkitUserSelect: "none" }}>
                                                                {opt.optionKey}. <MathJax inline dynamic>{sanitizeRenderableText(opt.labelRich)}</MathJax>
                                                            </span>
                                                        </div>
                                                    </button>
                                                );
                                            })
                                            : null}

                                        {(activeQuestion.questionType === "NAT_INTEGER" || activeQuestion.questionType === "NAT_DECIMAL") ? (
                                            <label className="rounded border p-3 ui-click" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                                                <div className="text-xs opacity-70">Enter numerical answer</div>
                                                <input
                                                    className="mt-2 w-full rounded border px-3 py-2 bg-transparent ui-field"
                                                    style={{ borderColor: "var(--border)" }}
                                                    inputMode="decimal"
                                                    value={numericValue}
                                                    onChange={(e) => {
                                                        setAnswersByQid((prev) => ({ ...prev, [activeQuestion.questionId]: e.target.value }));
                                                        setStatusByQid((prev) => ({
                                                            ...prev,
                                                            [activeQuestion.questionId]: prev[activeQuestion.questionId] === "NOT_VISITED" ? "VISITED_NOT_ANSWERED" : (prev[activeQuestion.questionId] ?? "VISITED_NOT_ANSWERED"),
                                                        }));
                                                    }}
                                                    placeholder="e.g. 12 or 3.5"
                                                />
                                            </label>
                                        ) : null}

                                        {(activeQuestion.questionType === "MATCHING_LIST" && activeQuestion.options.length === 0) ? (
                                            <div className="text-sm opacity-70">No options configured for this matching-list question.</div>
                                        ) : null}
                                    </div>
                                </div>

                                <div className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                                    <div className="text-xs font-medium opacity-75 mb-2">Actions</div>
                                    <div className="grid sm:hidden grid-cols-2 gap-2">
                                        <button
                                            className="inline-flex items-center justify-center h-10 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                            onClick={goPrev}
                                            disabled={saving}
                                        >
                                            Previous
                                        </button>
                                        <button
                                            className="inline-flex items-center justify-center h-10 rounded-full border px-3 text-xs font-semibold whitespace-nowrap ui-click"
                                            style={{
                                                borderColor: "rgba(59, 130, 246, 0.5)",
                                                background: "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(14,165,233,0.9))",
                                                color: "#e0f2fe",
                                            }}
                                            onClick={() => void saveAndNext()}
                                            disabled={saving}
                                        >
                                            Save & Next
                                        </button>
                                        <button
                                            className="inline-flex items-center justify-center h-10 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                            style={{ borderColor: "rgba(245, 158, 11, 0.5)", background: "rgba(146, 64, 14, 0.18)", color: "#fde68a" }}
                                            onClick={() => void markForReviewAndNext()}
                                            disabled={saving}
                                        >
                                            Mark & Next
                                        </button>
                                        <button
                                            className="inline-flex items-center justify-center h-10 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                            onClick={() => void nextWithAutoSave()}
                                            disabled={saving}
                                        >
                                            Next
                                        </button>
                                    </div>
                                    <div className="hidden sm:flex flex-wrap gap-2">
                                        <button
                                            className="inline-flex items-center justify-center h-10 rounded-full border px-4 text-sm whitespace-nowrap ui-click"
                                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                            onClick={goPrev}
                                            disabled={saving}
                                        >
                                            Previous
                                        </button>
                                        <button
                                            className="inline-flex items-center justify-center h-10 rounded-full border px-4 text-sm font-semibold whitespace-nowrap ui-click"
                                            style={{
                                                borderColor: "rgba(59, 130, 246, 0.5)",
                                                background: "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(14,165,233,0.9))",
                                                color: "#e0f2fe",
                                            }}
                                            onClick={() => void saveAndNext()}
                                            disabled={saving}
                                        >
                                            Save & Next
                                        </button>
                                        <button
                                            className="inline-flex items-center justify-center h-10 rounded-full border px-4 text-sm whitespace-nowrap ui-click"
                                            style={{ borderColor: "rgba(245, 158, 11, 0.5)", background: "rgba(146, 64, 14, 0.18)", color: "#fde68a" }}
                                            onClick={() => void markForReviewAndNext()}
                                            disabled={saving}
                                        >
                                            Mark for Review & Next
                                        </button>
                                        <button
                                            className="inline-flex items-center justify-center h-10 rounded-full border px-4 text-sm whitespace-nowrap ui-click"
                                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                            onClick={() => void clearResponse()}
                                            disabled={saving}
                                        >
                                            Clear Response
                                        </button>
                                        <button
                                            className="inline-flex items-center justify-center h-10 rounded-full border px-4 text-sm whitespace-nowrap ui-click"
                                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                            onClick={() => void nextWithAutoSave()}
                                            disabled={saving}
                                        >
                                            Next
                                        </button>
                                    </div>
                                </div>

                                {saveNextNotice ? <div className="mt-2 text-xs text-amber-500">{saveNextNotice}</div> : null}
                            </main>

                            <aside
                                className="hidden lg:block rounded-2xl border p-4 lg:sticky lg:top-24 lg:self-start"
                                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                            >
                                {paletteContent}
                            </aside>
                        </div>
                    </div>
                </div>

                {submitConfirmOpen ? (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        style={{ background: "rgba(0,0,0,0.45)" }}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Submit confirmation"
                    >
                        <div
                            className="w-full max-w-sm rounded-2xl border p-4"
                            style={{ borderColor: "var(--border)", background: "var(--card)" }}
                        >
                            <div className="text-base font-semibold">Submit Test?</div>
                            <div className="mt-1 text-sm opacity-70">Do you really want to submit?</div>

                            <div className="mt-4 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                    onClick={() => setSubmitConfirmOpen(false)}
                                    disabled={submitting}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs font-medium whitespace-nowrap ui-click"
                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                    onClick={async () => {
                                        if (submitting) return;
                                        setSubmitting(true);
                                        try {
                                            if (activeQuestionId) {
                                                const currentStatus = statusByQid[activeQuestionId] ?? "VISITED_NOT_ANSWERED";
                                                await pushResponse(activeQuestionId, currentStatus);
                                            }
                                            await apiPost(`/api/v2/attempts/${attemptId}/submit`, {});
                                            window.location.assign(`/advance/${attemptId}/report`);
                                        } finally {
                                            setSubmitting(false);
                                            setSubmitConfirmOpen(false);
                                        }
                                    }}
                                    disabled={submitting}
                                >
                                    {submitting ? "Submitting..." : "Submit"}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}

                {mobilePanelOpen ? (
                    <div className="lg:hidden fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Attempt menu">
                        <button
                            type="button"
                            className="absolute inset-0"
                            style={{ background: "rgba(0,0,0,0.45)" }}
                            onClick={() => setMobilePanelOpen(false)}
                            aria-label="Close menu backdrop"
                        />
                        <div
                            className="absolute inset-y-0 right-0 w-[92vw] max-w-sm border-l p-4 overflow-y-auto"
                            style={{ borderColor: "var(--border)", background: "var(--card)" }}
                        >
                            <div className="flex items-center justify-between">
                                <div className="text-sm font-semibold">Attempt Menu</div>
                                <button
                                    type="button"
                                    className="inline-flex items-center justify-center h-8 rounded-full border px-3 text-xs ui-click"
                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                    onClick={() => setMobilePanelOpen(false)}
                                >
                                    Close
                                </button>
                            </div>

                            <div className="mt-3">
                                {paletteContent}
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-2">
                                <button
                                    className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                    onClick={() => void clearResponse()}
                                    disabled={saving}
                                >
                                    Clear Response
                                </button>
                                <button
                                    className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                    style={{ borderColor: "rgba(245, 158, 11, 0.5)", background: "rgba(146, 64, 14, 0.18)", color: "#fde68a" }}
                                    onClick={() => setSubmitConfirmOpen(true)}
                                    disabled={submitting || submitConfirmOpen}
                                >
                                    Submit Test
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </MathJaxContext>
    );
}
