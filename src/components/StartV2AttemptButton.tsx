"use client";

import { useRef, useState } from "react";
import { apiPost } from "@/lib/api";

export function StartV2AttemptButton({ examId }: { examId: string }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const loadingRef = useRef(false);

    return (
        <div className="flex flex-col gap-2">
            <button
                className="inline-flex items-center justify-center h-10 rounded-full border px-4 text-sm font-semibold whitespace-nowrap ui-click"
                style={{
                    borderColor: "rgba(59, 130, 246, 0.5)",
                    background: "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(14,165,233,0.9))",
                    color: "#e0f2fe",
                }}
                disabled={loading}
                onClick={async () => {
                    if (loadingRef.current) return;
                    loadingRef.current = true;
                    setError(null);
                    setLoading(true);
                    try {
                        const res = await apiPost<{ attempt: { id: string } }>("/api/v2/attempts", {
                            examId,
                        });
                        window.location.assign(`/advance/${res.attempt.id}`);
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
                {loading ? (
                    <span className="inline-flex items-center gap-2">
                        <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                        Starting...
                    </span>
                ) : "Start Test"}
            </button>
            {error ? <div className="text-sm text-red-600">{error}</div> : null}
        </div>
    );
}
