"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiPost } from "@/lib/api";

export function StartAttemptButton({ testId }: { testId: string }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    return (
        <div className="flex flex-col gap-2">
            <button
                className="px-4 py-2 rounded font-medium border"
                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                disabled={loading}
                onClick={async () => {
                    setError(null);
                    setLoading(true);
                    try {
                        // Best-effort fullscreen
                        if (document.documentElement.requestFullscreen) {
                            await document.documentElement.requestFullscreen().catch(() => { });
                        }

                        const res = await apiPost<{ attemptId: string }>("/api/attempts", {
                            testId,
                        });
                        router.push(`/attempt/${res.attemptId}`);
                    } catch (e) {
                        setError(e instanceof Error ? e.message : "Failed to start");
                    } finally {
                        setLoading(false);
                    }
                }}
            >
                {loading ? "Starting…" : "Start Test"}
            </button>
            {error ? <div className="text-sm text-red-600">{error}</div> : null}
        </div>
    );
}
