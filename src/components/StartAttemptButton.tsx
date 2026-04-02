"use client";

import { useRef, useState } from "react";
import { apiPost } from "@/lib/api";

export function StartAttemptButton({ testId }: { testId: string }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const loadingRef = useRef(false);

    return (
        <div className="flex flex-col gap-2">
            <button
                className="inline-flex items-center justify-center h-10 rounded-full border px-4 text-sm font-medium whitespace-nowrap ui-click"
                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                disabled={loading}
                onClick={async () => {
                    if (loadingRef.current) return;
                    loadingRef.current = true;
                    setError(null);
                    setLoading(true);
                    try {
                        try {
                            if (!document.fullscreenElement) {
                                const root = document.documentElement as HTMLElement & {
                                    webkitRequestFullscreen?: () => Promise<void> | void;
                                    mozRequestFullScreen?: () => Promise<void> | void;
                                    msRequestFullscreen?: () => Promise<void> | void;
                                };
                                const requestFn =
                                    root.requestFullscreen ??
                                    root.webkitRequestFullscreen ??
                                    root.mozRequestFullScreen ??
                                    root.msRequestFullscreen;
                                if (requestFn) {
                                    await Promise.resolve(requestFn.call(root));
                                }
                            }
                        } catch {
                            // Fullscreen may be blocked by browser policy; continue to exam.
                        }

                        const res = await apiPost<{ attemptId: string }>("/api/attempts", {
                            testId,
                        });
                        window.location.assign(`/attempt/${res.attemptId}`);
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : "Failed to start";
                        if (msg.startsWith("401")) {
                            window.location.assign("/login");
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
