"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

type ReportPayload = {
    attempt: {
        id: string;
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
        timeOnCorrectSeconds: number;
        timeOnIncorrectSeconds: number;
        topicAccuracy: Array<{ topic: string; accuracy: number; correct: number; total: number }>;
    };
};

function fmt(s: number) {
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return `${mm}m ${ss}s`;
}

export function AttemptReportClient({ attemptId }: { attemptId: string }) {
    const [data, setData] = useState<ReportPayload | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await apiGet<ReportPayload>(`/api/attempts/${attemptId}/report`);
                if (!cancelled) setData(res);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to load report");
            }
        })();
        return () => {
            cancelled = true;
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
                <div className="text-sm opacity-70">Loading report…</div>
            </div>
        );
    }

    const subjects = Object.entries(data.analytics.subjectSummary);

    return (
        <div className="min-h-screen flex flex-col">
            <header className="border-b" style={{ borderColor: "var(--border)" }}>
                <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
                    <Link href="/" className="text-sm underline">
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

                <div className="mt-6 grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                        <div className="text-xs opacity-70">Score</div>
                        <div className="text-2xl font-semibold">{data.attempt.score ?? "—"}</div>
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
            </main>
        </div>
    );
}
