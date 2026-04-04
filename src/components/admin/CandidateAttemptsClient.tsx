"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type AttemptItem = {
    id: string;
    status: string;
    overallScore: number | null;
    startTimestamp: string;
    endTimestamp: string | null;
    responseCount: number;
    answeredCount: number;
    totalTimeSeconds: number;
    activityCount: number;
    issueCount: number;
};

function fmtDate(d: string | null) {
    if (!d) return "—";
    try {
        return new Intl.DateTimeFormat("en-IN", {
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Kolkata",
        }).format(new Date(d));
    } catch {
        return d;
    }
}

function fmtTime(seconds: number): string {
    const clamped = Math.max(0, Math.floor(seconds));
    const hh = Math.floor(clamped / 3600);
    const mm = Math.floor((clamped % 3600) / 60);
    const ss = clamped % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

export function CandidateAttemptsClient({
    initialAttempts,
    candidateLabel,
    testTitle,
}: {
    initialAttempts: AttemptItem[];
    candidateLabel: string;
    testTitle: string;
}) {
    const [attempts, setAttempts] = useState(initialAttempts);
    const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const selected = useMemo(
        () => attempts.find((a) => a.id === selectedAttemptId) ?? null,
        [attempts, selectedAttemptId],
    );

    async function deleteSelected() {
        if (!selected || deleting) return;

        setDeleting(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/attempts/${selected.id}`, {
                method: "DELETE",
                headers: { "content-type": "application/json" },
            });

            if (!res.ok) {
                const text = await res.text().catch(() => "");
                throw new Error(`${res.status} ${res.statusText} ${text}`);
            }

            setAttempts((prev) => prev.filter((a) => a.id !== selected.id));
            setSelectedAttemptId(null);
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Failed to delete attempt";
            setError(msg);
        } finally {
            setDeleting(false);
        }
    }

    return (
        <>
            <div className="mt-6 grid gap-3">
                {attempts.map((a) => (
                    <div
                        key={a.id}
                        className="rounded-2xl border p-4 shadow-sm"
                        style={{ borderColor: "var(--border)", background: "var(--card)" }}
                    >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                                <div className="text-base font-semibold">Attempt {a.id.slice(0, 8)}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                                    <span className="inline-flex items-center justify-center h-7 rounded-full border px-2.5 whitespace-nowrap" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                                        {a.status}
                                    </span>
                                    <span className="opacity-60">Score {a.overallScore ?? "—"}</span>
                                </div>
                                <div className="mt-1 text-xs opacity-60">
                                    Start {fmtDate(a.startTimestamp)} · End {fmtDate(a.endTimestamp)}
                                </div>
                                <div className="mt-1 text-xs opacity-60">
                                    Answered {a.answeredCount}/{a.responseCount} · Time {fmtTime(a.totalTimeSeconds)} ·
                                    Activities {a.activityCount} · Issues {a.issueCount}
                                </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                <Link
                                    href={`/attempt/${a.id}/report`}
                                    className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                    style={{
                                        borderColor: "rgba(59, 130, 246, 0.5)",
                                        background: "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(14,165,233,0.9))",
                                        color: "#e0f2fe",
                                    }}
                                >
                                    View report
                                </Link>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedAttemptId(a.id);
                                        setError(null);
                                    }}
                                    className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                    style={{ borderColor: "rgba(239,68,68,0.45)", background: "rgba(239,68,68,0.12)", color: "#fca5a5" }}
                                >
                                    Delete attempt
                                </button>
                            </div>
                        </div>
                    </div>
                ))}

                {attempts.length === 0 ? (
                    <div className="rounded-xl border p-4 text-sm opacity-70" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                        No attempts found for this paper.
                    </div>
                ) : null}
            </div>

            {selected ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ background: "rgba(0,0,0,0.45)" }}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Delete attempt confirmation"
                >
                    <div
                        className="w-full max-w-lg rounded-lg border p-4"
                        style={{ borderColor: "var(--border)", background: "var(--card)" }}
                    >
                        <div className="text-base font-semibold">Delete attempt?</div>
                        <div className="mt-1 text-sm opacity-70">
                            Review details carefully. This action cannot be undone.
                        </div>

                        <div
                            className="mt-3 rounded border p-3 text-xs"
                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        >
                            <div><span className="opacity-70">Candidate:</span> {candidateLabel}</div>
                            <div><span className="opacity-70">Paper:</span> {testTitle}</div>
                            <div><span className="opacity-70">Attempt ID:</span> {selected.id}</div>
                            <div><span className="opacity-70">Status:</span> {selected.status}</div>
                            <div><span className="opacity-70">Score:</span> {selected.overallScore ?? "—"}</div>
                            <div><span className="opacity-70">Start:</span> {fmtDate(selected.startTimestamp)}</div>
                            <div><span className="opacity-70">End:</span> {fmtDate(selected.endTimestamp)}</div>
                            <div><span className="opacity-70">Answered:</span> {selected.answeredCount}/{selected.responseCount}</div>
                            <div><span className="opacity-70">Total time:</span> {fmtTime(selected.totalTimeSeconds)}</div>
                            <div><span className="opacity-70">Activity logs:</span> {selected.activityCount}</div>
                            <div><span className="opacity-70">Issue reports:</span> {selected.issueCount}</div>
                        </div>

                        {error ? <div className="mt-3 text-xs text-red-400">{error}</div> : null}

                        <div className="mt-4 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                onClick={() => {
                                    if (deleting) return;
                                    setSelectedAttemptId(null);
                                }}
                                disabled={deleting}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                style={{ borderColor: "rgba(239,68,68,0.45)", background: "rgba(239,68,68,0.16)", color: "#fca5a5" }}
                                onClick={() => void deleteSelected()}
                                disabled={deleting}
                            >
                                {deleting ? "Deleting..." : "Yes, delete permanently"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}
