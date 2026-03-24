"use client";

import { MathJaxContext } from "better-react-mathjax";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost } from "@/lib/api";
import type { AttemptPayload, AttemptQuestion } from "@/lib/types";
import {
    deleteOutboxItem,
    enqueueOutbox,
    listOutbox,
    loadAttemptSnapshot,
    saveAttemptSnapshot,
} from "@/lib/localDb";
import {
    type PaletteStatus,
} from "@/components/exam/palette";
import { QuestionView } from "@/components/exam/QuestionView";
import { QuestionPalette } from "@/components/exam/QuestionPalette";
import { ThemeToggle } from "@/components/ThemeToggle";

const mathjaxConfig = {
    loader: { load: ["[tex]/mhchem"] },
    tex: {
        packages: { "[+]": ["mhchem"] },
        inlineMath: [["$", "$"], ["\\(", "\\)"]],
        displayMath: [["$$", "$$"], ["\\[", "\\]"]],
    },
} as const;

type AnswerByQid = Record<string, unknown>;

type PaletteByQid = Record<string, PaletteStatus>;

type TimeByQid = Record<string, number>;

type OutboxKind = "response" | "event" | "submit";

async function safePost<T>(
    path: string,
    body: unknown,
    fallback: { attemptId: string; kind: OutboxKind; payload: unknown },
): Promise<T | null> {
    try {
        return await apiPost<T>(path, body);
    } catch {
        await enqueueOutbox({
            attemptId: fallback.attemptId,
            kind: fallback.kind,
            payload: fallback.payload,
        });
        return null;
    }
}

function formatTime(s: number) {
    const clamped = Math.max(0, s);
    const hh = Math.floor(clamped / 3600);
    const mm = Math.floor((clamped % 3600) / 60);
    const ss = clamped % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

export function ExamClient({ attemptId }: { attemptId: string }) {
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [questions, setQuestions] = useState<AttemptQuestion[]>([]);
    const [testTitle, setTestTitle] = useState<string>("");
    const [durationSeconds, setDurationSeconds] = useState<number>(180 * 60);
    const [studentName, setStudentName] = useState<string | null>(null);

    const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
    const [paletteByQid, setPaletteByQid] = useState<PaletteByQid>({});
    const [answersByQid, setAnswersByQid] = useState<AnswerByQid>({});
    const [timeByQid, setTimeByQid] = useState<TimeByQid>({});

    const syncedTimeByQidRef = useRef<Record<string, number>>({});

    const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(durationSeconds);

    const autoSubmittedRef = useRef(false);

    const serverOffsetMsRef = useRef<number>(0);
    const attemptStartMsRef = useRef<number>(0);

    const idleTimeoutMs =
        Number(process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MS ?? 300000) || 300000;
    const heartbeatIntervalMs =
        Number(process.env.NEXT_PUBLIC_HEARTBEAT_INTERVAL_MS ?? 30000) || 30000;

    const [idlePaused, setIdlePaused] = useState(false);
    const idleLoggedRef = useRef(false);
    const lastActivityRef = useRef<number>(Date.now());

    const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const activeQuestion = useMemo(
        () => questions.find((q) => q.id === activeQuestionId) ?? null,
        [questions, activeQuestionId],
    );

    const subjects = useMemo(() => {
        const map = new Map<number, string>();
        for (const q of questions) map.set(q.subject.id, q.subject.name);
        return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    }, [questions]);

    const [activeSubjectId, setActiveSubjectId] = useState<number | null>(null);

    const questionsInActiveSubject = useMemo(() => {
        if (!activeSubjectId) return questions;
        return questions.filter((q) => q.subject.id === activeSubjectId);
    }, [questions, activeSubjectId]);

    async function flushOutbox() {
        const items = await listOutbox(attemptId);
        items.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

        for (const item of items) {
            if (item.id == null) continue;
            try {
                if (item.kind === "response") {
                    await apiPost(`/api/attempts/${attemptId}/responses`, item.payload);
                } else if (item.kind === "event") {
                    await apiPost(`/api/attempts/${attemptId}/events`, item.payload);
                } else if (item.kind === "submit") {
                    await apiPost(`/api/attempts/${attemptId}/submit`, item.payload);
                }
                await deleteOutboxItem(item.id);
            } catch {
                break;
            }
        }
    }

    function flushActiveQuestionTimeKeepalive(reason: string) {
        if (!activeQuestionId) return;

        const local = timeByQid[activeQuestionId] ?? 0;
        const synced = syncedTimeByQidRef.current[activeQuestionId] ?? 0;
        const delta = Math.max(0, local - synced);
        if (delta <= 0) return;

        syncedTimeByQidRef.current[activeQuestionId] = local;
        const payload = {
            questionId: activeQuestionId,
            paletteStatus: paletteByQid[activeQuestionId] ?? "VISITED_NOT_ANSWERED",
            timeDeltaSeconds: delta,
            action: "NAVIGATE" as const,
        };

        try {
            fetch(`/api/attempts/${attemptId}/responses`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
                keepalive: true,
            });
            fetch(`/api/attempts/${attemptId}/events`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ type: "HEARTBEAT", questionId: activeQuestionId, payload: { reason } }),
                keepalive: true,
            });
        } catch {
            // Best-effort only.
        }
    }

    function logEvent(type: string, questionId?: string, payload?: unknown) {
        void safePost(
            `/api/attempts/${attemptId}/events`,
            { type, questionId, payload },
            {
                attemptId,
                kind: "event",
                payload: { type, questionId, payload },
            },
        );
    }

    async function persistSnapshot(next?: Partial<Parameters<typeof saveAttemptSnapshot>[0]>) {
        const snapshot = {
            attemptId,
            activeQuestionId,
            paletteByQuestionId: paletteByQid,
            answersByQuestionId: answersByQid,
            timeByQuestionId: timeByQid,
            updatedAt: new Date().toISOString(),
            ...next,
        };
        await saveAttemptSnapshot(snapshot);
    }

    // Load: snapshot first, then server
    useEffect(() => {
        let cancelled = false;

        (async () => {
            setLoading(true);
            setLoadError(null);

            try {
                const snapshot = await loadAttemptSnapshot(attemptId);
                if (!cancelled && snapshot) {
                    setActiveQuestionId(snapshot.activeQuestionId);
                    setPaletteByQid(snapshot.paletteByQuestionId as PaletteByQid);
                    setAnswersByQid(snapshot.answersByQuestionId);
                    setTimeByQid(snapshot.timeByQuestionId);
                }

                const data = await apiGet<AttemptPayload>(`/api/attempts/${attemptId}`);
                if (cancelled) return;

                setQuestions(data.attempt.questions);
                setTestTitle(data.attempt.test.title);
                setDurationSeconds(data.attempt.test.totalDurationMinutes * 60);
                setStudentName(data.attempt.studentName);

                const serverNowMs = Date.parse(data.attempt.serverNow);
                serverOffsetMsRef.current = serverNowMs - Date.now();
                attemptStartMsRef.current = Date.parse(data.attempt.startTimestamp);

                const initPalette: PaletteByQid = {};
                const initAnswers: AnswerByQid = {};
                const initTimes: TimeByQid = {};
                for (const q of data.attempt.questions) {
                    initPalette[q.id] = "NOT_VISITED";
                    initAnswers[q.id] = null;
                    initTimes[q.id] = 0;
                }
                for (const r of data.attempt.responses) {
                    initPalette[r.questionId] = r.paletteStatus as PaletteStatus;
                    initAnswers[r.questionId] = r.selectedAnswer;
                    initTimes[r.questionId] = r.timeSpentSeconds;
                }

                syncedTimeByQidRef.current = { ...initTimes };

                setPaletteByQid((prev) => ({ ...initPalette, ...prev }));
                setAnswersByQid((prev) => ({ ...initAnswers, ...prev }));
                setTimeByQid((prev) => ({ ...initTimes, ...prev }));

                if (!activeQuestionId) {
                    setActiveQuestionId(data.attempt.questions[0]?.id ?? null);
                }

                setActiveSubjectId((prev) => prev ?? data.attempt.questions[0]?.subject.id ?? null);

                void flushOutbox();
            } catch (e) {
                const msg = e instanceof Error ? e.message : "Failed to load attempt";
                if (msg.startsWith("401")) {
                    router.push("/login");
                    return;
                }
                setLoadError(msg);
            } finally {
                setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attemptId]);

    // Master timer tick
    useEffect(() => {
        if (!attemptStartMsRef.current) return;

        const timer = window.setInterval(() => {
            const nowServer = Date.now() + serverOffsetMsRef.current;
            const elapsedSeconds = Math.floor((nowServer - attemptStartMsRef.current) / 1000);
            const left = durationSeconds - elapsedSeconds;
            setTimeLeftSeconds(left);

            if (left <= 0) {
                window.clearInterval(timer);
            }
        }, 250);

        return () => window.clearInterval(timer);
    }, [durationSeconds]);

    useEffect(() => {
        if (timeLeftSeconds > 0) return;
        if (autoSubmittedRef.current) return;
        autoSubmittedRef.current = true;
        void submit();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeLeftSeconds]);

    // Per-question timer tick
    useEffect(() => {
        if (!activeQuestionId) return;

        const tick = window.setInterval(() => {
            if (idlePaused) return;
            setTimeByQid((prev) => ({
                ...prev,
                [activeQuestionId]: (prev[activeQuestionId] ?? 0) + 1,
            }));
        }, 1000);

        return () => window.clearInterval(tick);
    }, [activeQuestionId, idlePaused]);

    // Idle detection
    useEffect(() => {
        const onActivity = () => {
            lastActivityRef.current = Date.now();
            if (idlePaused) {
                setIdlePaused(false);
                idleLoggedRef.current = false;
                logEvent("IDLE_END", activeQuestionId ?? undefined);
            }
        };

        window.addEventListener("mousemove", onActivity, { passive: true });
        window.addEventListener("keydown", onActivity);
        window.addEventListener("mousedown", onActivity);

        const poll = window.setInterval(() => {
            const idleFor = Date.now() - lastActivityRef.current;
            if (!idlePaused && idleFor >= idleTimeoutMs) {
                setIdlePaused(true);
                if (!idleLoggedRef.current) {
                    idleLoggedRef.current = true;
                    logEvent("IDLE_START", activeQuestionId ?? undefined, { idleForMs: idleFor });
                }
            }
        }, 1000);

        return () => {
            window.removeEventListener("mousemove", onActivity);
            window.removeEventListener("keydown", onActivity);
            window.removeEventListener("mousedown", onActivity);
            window.clearInterval(poll);
        };
    }, [activeQuestionId, idlePaused, idleTimeoutMs]);

    // Visibility / fullscreen proctoring
    useEffect(() => {
        const onVis = () => {
            if (document.visibilityState === "hidden") logEvent("TAB_HIDDEN", activeQuestionId ?? undefined);
            else logEvent("TAB_VISIBLE", activeQuestionId ?? undefined);
        };
        const onFs = () => {
            if (!document.fullscreenElement) logEvent("FULLSCREEN_EXIT", activeQuestionId ?? undefined);
            else logEvent("FULLSCREEN_ENTER", activeQuestionId ?? undefined);
        };

        document.addEventListener("visibilitychange", onVis);
        document.addEventListener("fullscreenchange", onFs);

        return () => {
            document.removeEventListener("visibilitychange", onVis);
            document.removeEventListener("fullscreenchange", onFs);
        };
    }, [activeQuestionId]);

    // Best-effort flush on tab close / navigation away
    useEffect(() => {
        const onPageHide = () => {
            flushActiveQuestionTimeKeepalive("pagehide");
            void persistSnapshot();
        };
        window.addEventListener("pagehide", onPageHide);
        return () => window.removeEventListener("pagehide", onPageHide);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeQuestionId, paletteByQid, timeByQid]);

    // Security-ish UX hardening
    useEffect(() => {
        const onContextMenu = (e: Event) => e.preventDefault();
        const onKeyDown = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            const ctrlOrMeta = e.ctrlKey || e.metaKey;

            if (ctrlOrMeta && ["c", "v", "x"].includes(key)) {
                e.preventDefault();
                return;
            }

            // Keyboard shortcuts
            if (e.altKey && key === "n") {
                e.preventDefault();
                goNext();
            }
            if (e.altKey && key === "v") {
                e.preventDefault();
                markForReviewAndNext();
            }

            if (!e.altKey && !ctrlOrMeta && ["1", "2", "3", "4"].includes(key)) {
                const idx = Number(key) - 1;
                const opt = activeQuestion?.options[idx];
                if (opt) {
                    e.preventDefault();
                    if (activeQuestion?.markingSchemeType === "ADV_MULTI_CORRECT") {
                        toggleMulti(opt.key);
                    } else {
                        setAnswer(opt.key);
                    }
                }
            }
        };

        window.addEventListener("contextmenu", onContextMenu);
        window.addEventListener("keydown", onKeyDown);

        return () => {
            window.removeEventListener("contextmenu", onContextMenu);
            window.removeEventListener("keydown", onKeyDown);
        };
    });

    // Heartbeat + flush outbox
    useEffect(() => {
        const t = window.setInterval(() => {
            if (activeQuestionId) {
                const local = timeByQid[activeQuestionId] ?? 0;
                const synced = syncedTimeByQidRef.current[activeQuestionId] ?? 0;
                const delta = Math.max(0, local - synced);
                if (delta > 0) {
                    syncedTimeByQidRef.current[activeQuestionId] = local;
                    void safePost(
                        `/api/attempts/${attemptId}/responses`,
                        {
                            questionId: activeQuestionId,
                            paletteStatus: paletteByQid[activeQuestionId] ?? "VISITED_NOT_ANSWERED",
                            timeDeltaSeconds: delta,
                            action: "NAVIGATE",
                        },
                        {
                            attemptId,
                            kind: "response",
                            payload: {
                                questionId: activeQuestionId,
                                paletteStatus: paletteByQid[activeQuestionId] ?? "VISITED_NOT_ANSWERED",
                                timeDeltaSeconds: delta,
                                action: "NAVIGATE",
                            },
                        },
                    );
                }
            }

            logEvent("HEARTBEAT", activeQuestionId ?? undefined, {
                timeLeftSeconds,
            });
            void flushOutbox();
        }, heartbeatIntervalMs);

        return () => window.clearInterval(t);
    }, [activeQuestionId, heartbeatIntervalMs, paletteByQid, timeByQid, timeLeftSeconds]);

    // Snapshot debounce
    const snapshotTimer = useRef<number | null>(null);
    useEffect(() => {
        if (snapshotTimer.current) window.clearTimeout(snapshotTimer.current);
        snapshotTimer.current = window.setTimeout(() => {
            void persistSnapshot();
        }, 750);

        return () => {
            if (snapshotTimer.current) window.clearTimeout(snapshotTimer.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeQuestionId, paletteByQid, answersByQid, timeByQid]);

    useEffect(() => {
        const onOnline = () => void flushOutbox();
        window.addEventListener("online", onOnline);
        return () => window.removeEventListener("online", onOnline);
    }, []);

    function setAnswer(value: unknown) {
        if (!activeQuestionId) return;
        setAnswersByQid((prev) => ({ ...prev, [activeQuestionId]: value }));
    }

    function toggleMulti(optionKey: string) {
        if (!activeQuestionId) return;
        const current = answersByQid[activeQuestionId];
        const arr = Array.isArray(current) ? current.map(String) : [];
        const next = new Set(arr);
        if (next.has(optionKey)) next.delete(optionKey);
        else next.add(optionKey);
        setAnswer(Array.from(next).sort());
    }

    function clearResponse() {
        if (!activeQuestionId) return;

        setAnswersByQid((prev) => ({ ...prev, [activeQuestionId]: null }));
        setPaletteByQid((prev) => ({
            ...prev,
            [activeQuestionId]: "VISITED_NOT_ANSWERED",
        }));

        void safePost(
            `/api/attempts/${attemptId}/responses`,
            {
                questionId: activeQuestionId,
                selectedAnswer: null,
                paletteStatus: "VISITED_NOT_ANSWERED",
                timeDeltaSeconds: 0,
                action: "CLEAR_RESPONSE",
            },
            {
                attemptId,
                kind: "response",
                payload: {
                    questionId: activeQuestionId,
                    selectedAnswer: null,
                    paletteStatus: "VISITED_NOT_ANSWERED",
                    timeDeltaSeconds: 0,
                    action: "CLEAR_RESPONSE",
                },
            },
        );
    }

    function goToQuestion(questionId: string) {
        const prevQid = activeQuestionId;

        if (prevQid) {
            const local = timeByQid[prevQid] ?? 0;
            const synced = syncedTimeByQidRef.current[prevQid] ?? 0;
            const delta = Math.max(0, local - synced);
            if (delta > 0) {
                syncedTimeByQidRef.current[prevQid] = local;

                void safePost(
                    `/api/attempts/${attemptId}/responses`,
                    {
                        questionId: prevQid,
                        paletteStatus: paletteByQid[prevQid] ?? "VISITED_NOT_ANSWERED",
                        timeDeltaSeconds: delta,
                        action: "NAVIGATE",
                    },
                    {
                        attemptId,
                        kind: "response",
                        payload: {
                            questionId: prevQid,
                            paletteStatus: paletteByQid[prevQid] ?? "VISITED_NOT_ANSWERED",
                            timeDeltaSeconds: delta,
                            action: "NAVIGATE",
                        },
                    },
                );
            }
        }

        setActiveQuestionId(questionId);
        setPaletteByQid((prev) => ({
            ...prev,
            [questionId]: prev[questionId] === "NOT_VISITED" ? "VISITED_NOT_ANSWERED" : (prev[questionId] ?? "VISITED_NOT_ANSWERED"),
        }));

        logEvent("QUESTION_LOAD", questionId);
    }

    function currentQuestionIndexInAll() {
        if (!activeQuestionId) return -1;
        return questions.findIndex((q) => q.id === activeQuestionId);
    }

    function currentQuestionIndexInActiveSubject() {
        if (!activeQuestionId) return -1;
        return questionsInActiveSubject.findIndex((q) => q.id === activeQuestionId);
    }

    function goNext() {
        const idx = activeSubjectId ? currentQuestionIndexInActiveSubject() : currentQuestionIndexInAll();
        const list = activeSubjectId ? questionsInActiveSubject : questions;
        const next = list[idx + 1];
        if (next) goToQuestion(next.id);
    }

    function goPrev() {
        const idx = activeSubjectId ? currentQuestionIndexInActiveSubject() : currentQuestionIndexInAll();
        const list = activeSubjectId ? questionsInActiveSubject : questions;
        const prev = list[idx - 1];
        if (prev) goToQuestion(prev.id);
    }

    function saveAndNext() {
        if (!activeQuestionId) return;
        const answer = answersByQid[activeQuestionId] ?? null;

        const local = timeByQid[activeQuestionId] ?? 0;
        const synced = syncedTimeByQidRef.current[activeQuestionId] ?? 0;
        const delta = Math.max(0, local - synced);
        syncedTimeByQidRef.current[activeQuestionId] = local;

        const hasAnswer =
            Array.isArray(answer)
                ? answer.length > 0
                : answer != null && !(typeof answer === "string" && answer.trim() === "");

        const paletteStatus: PaletteStatus = hasAnswer
            ? "ANSWERED_SAVED"
            : "VISITED_NOT_ANSWERED";

        setPaletteByQid((prev) => ({ ...prev, [activeQuestionId]: paletteStatus }));

        void safePost(
            `/api/attempts/${attemptId}/responses`,
            {
                questionId: activeQuestionId,
                selectedAnswer: answer,
                paletteStatus,
                timeDeltaSeconds: delta,
                action: "SAVE_NEXT",
            },
            {
                attemptId,
                kind: "response",
                payload: {
                    questionId: activeQuestionId,
                    selectedAnswer: answer,
                    paletteStatus,
                    timeDeltaSeconds: delta,
                    action: "SAVE_NEXT",
                },
            },
        );

        goNext();
    }

    function markForReviewAndNext() {
        if (!activeQuestionId) return;
        const answer = answersByQid[activeQuestionId] ?? null;

        const local = timeByQid[activeQuestionId] ?? 0;
        const synced = syncedTimeByQidRef.current[activeQuestionId] ?? 0;
        const delta = Math.max(0, local - synced);
        syncedTimeByQidRef.current[activeQuestionId] = local;

        const hasAnswer =
            Array.isArray(answer)
                ? answer.length > 0
                : answer != null && !(typeof answer === "string" && answer.trim() === "");

        const paletteStatus: PaletteStatus = hasAnswer
            ? "ANSWERED_MARKED_FOR_REVIEW"
            : "MARKED_FOR_REVIEW";

        setPaletteByQid((prev) => ({ ...prev, [activeQuestionId]: paletteStatus }));

        void safePost(
            `/api/attempts/${attemptId}/responses`,
            {
                questionId: activeQuestionId,
                selectedAnswer: answer,
                paletteStatus,
                timeDeltaSeconds: delta,
                action: "MARK_REVIEW_NEXT",
            },
            {
                attemptId,
                kind: "response",
                payload: {
                    questionId: activeQuestionId,
                    selectedAnswer: answer,
                    paletteStatus,
                    timeDeltaSeconds: delta,
                    action: "MARK_REVIEW_NEXT",
                },
            },
        );

        goNext();
    }

    async function submit() {
        if (submitting) return;
        setSubmitting(true);
        try {
            if (activeQuestionId) {
                const local = timeByQid[activeQuestionId] ?? 0;
                const synced = syncedTimeByQidRef.current[activeQuestionId] ?? 0;
                const delta = Math.max(0, local - synced);
                if (delta > 0) {
                    syncedTimeByQidRef.current[activeQuestionId] = local;
                    await apiPost(`/api/attempts/${attemptId}/responses`, {
                        questionId: activeQuestionId,
                        paletteStatus: paletteByQid[activeQuestionId] ?? "VISITED_NOT_ANSWERED",
                        timeDeltaSeconds: delta,
                        action: "NAVIGATE",
                    });
                }
            }
            await apiPost(`/api/attempts/${attemptId}/submit`, {});
            router.push(`/attempt/${attemptId}/report`);
        } catch {
            await enqueueOutbox({ attemptId, kind: "submit", payload: {} });
            router.push(`/attempt/${attemptId}/report`);
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-sm opacity-70">Loading attempt…</div>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-3">
                <div className="text-sm text-red-600">{loadError}</div>
                <Link href="/" className="text-sm underline">
                    Back
                </Link>
            </div>
        );
    }

    return (
        <MathJaxContext version={3} config={mathjaxConfig}>
            <div className="min-h-screen flex flex-col">
                <header
                    className="relative z-40 border-b"
                    style={{ borderColor: "var(--border)", background: "var(--card)" }}
                >
                    <div className="px-4 py-3 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                            <div className="font-semibold truncate">{testTitle}</div>
                            <div className="text-xs opacity-70">
                                Attempt: {attemptId.slice(0, 8)} · Idle: {idlePaused ? "paused" : "active"}
                            </div>
                            <div className="text-xs opacity-60">Student: {studentName ?? "—"}</div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="text-sm font-mono">{formatTime(timeLeftSeconds)}</div>
                            <ThemeToggle />
                            <button
                                className="text-xs rounded-full border px-3 py-1 ui-click"
                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                onClick={() => setSubmitConfirmOpen(true)}
                                disabled={submitting}
                            >
                                Submit
                            </button>
                        </div>
                    </div>
                </header>

                <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_360px]">
                    <main className="p-4">
                        {activeQuestion ? (
                            <QuestionView
                                attemptId={attemptId}
                                question={activeQuestion}
                                answer={answersByQid[activeQuestion.id] ?? null}
                                paletteStatus={paletteByQid[activeQuestion.id] ?? "NOT_VISITED"}
                                onSetAnswer={(value) => setAnswer(value)}
                                onClear={clearResponse}
                            />
                        ) : (
                            <div className="text-sm opacity-70">No question loaded.</div>
                        )}

                        <div className="mt-4 flex flex-wrap gap-2">
                            <button
                                className="px-3 py-2 rounded border text-sm ui-click"
                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                onClick={goPrev}
                            >
                                Previous
                            </button>
                            <button
                                className="px-3 py-2 rounded border text-sm ui-click"
                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                onClick={saveAndNext}
                            >
                                Save & Next
                            </button>
                            <button
                                className="px-3 py-2 rounded border text-sm ui-click"
                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                onClick={markForReviewAndNext}
                            >
                                Mark for Review & Next
                            </button>
                            <button
                                className="px-3 py-2 rounded border text-sm ui-click"
                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                onClick={clearResponse}
                            >
                                Clear Response
                            </button>
                        </div>

                        <div className="mt-3 text-xs opacity-70">
                            Shortcuts: Alt+N Next · Alt+V Mark · 1-4 Select option
                        </div>
                    </main>

                    <aside
                        className="border-t lg:border-t-0 lg:border-l p-4"
                        style={{ borderColor: "var(--border)", background: "var(--card)" }}
                    >
                        <div className="flex items-center justify-between">
                            <div className="font-medium">Question Palette</div>
                            <div className="text-xs opacity-70">Bento grid</div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                            {subjects.map((s) => (
                                <button
                                    key={s.id}
                                    className={`text-sm px-2 py-1 rounded border ui-click ${activeSubjectId === s.id
                                        ? "font-medium ring-2 ring-black/30 dark:ring-white/30"
                                        : "opacity-80"
                                        }`}
                                    style={{
                                        borderColor: "var(--border)",
                                        background: activeSubjectId === s.id ? "var(--card)" : "var(--muted)",
                                    }}
                                    onClick={() => {
                                        setActiveSubjectId(s.id);
                                        const firstInSubject = questions.find((q) => q.subject.id === s.id);
                                        if (firstInSubject && firstInSubject.id !== activeQuestionId) {
                                            goToQuestion(firstInSubject.id);
                                        }
                                    }}
                                >
                                    {s.name}
                                </button>
                            ))}
                        </div>

                        <div className="mt-4">
                            <QuestionPalette
                                questions={questionsInActiveSubject}
                                paletteByQid={paletteByQid}
                                activeQuestionId={activeQuestionId}
                                onPick={(qid) => {
                                    setActiveSubjectId(
                                        questions.find((q) => q.id === qid)?.subject.id ?? activeSubjectId,
                                    );
                                    goToQuestion(qid);
                                }}
                            />
                        </div>
                    </aside>
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
                            className="w-full max-w-sm rounded-lg border p-4"
                            style={{ borderColor: "var(--border)", background: "var(--card)" }}
                        >
                            <div className="text-base font-semibold">Submit Test?</div>
                            <div className="mt-1 text-sm opacity-70">
                                Do you really want to submit?
                            </div>

                            <div className="mt-4 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    className="text-xs rounded-full border px-3 py-1 ui-click"
                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                    onClick={() => setSubmitConfirmOpen(false)}
                                    disabled={submitting}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="text-xs font-medium rounded-full border px-3 py-1 ui-click"
                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                    onClick={() => {
                                        setSubmitConfirmOpen(false);
                                        void submit();
                                    }}
                                    disabled={submitting}
                                >
                                    {submitting ? "Submitting…" : "Submit"}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </MathJaxContext>
    );
}
