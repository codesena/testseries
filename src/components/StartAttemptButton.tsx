"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { apiPost } from "@/lib/api";

export function StartAttemptButton({ testId }: { testId: string }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const loadingRef = useRef(false);

    return (
        <div className="flex flex-col gap-2">
            <button
                className="px-5 py-2 rounded-full font-medium border ui-click"
                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                disabled={loading}
                onClick={async () => {
                    if (loadingRef.current) return;
                    loadingRef.current = true;
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
                        const msg = e instanceof Error ? e.message : "Failed to start";
                        if (msg.startsWith("401")) {
                            router.push("/login");
                            return;
                        }
                        setError(msg);
                    } finally {
                        setLoading(false);
                        loadingRef.current = false;
                    }
                }}
            >
                {loading ? "Starting…" : "Start Test"}
            </button>
            {error ? <div className="text-sm text-red-600">{error}</div> : null}
        </div>
    );
}
