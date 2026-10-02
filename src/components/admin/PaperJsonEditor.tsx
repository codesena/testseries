"use client";

import { useEffect, useState } from "react";

function highlightedJson(raw: string): string {
    const escaped = raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return escaped.replace(/("(?:\\.|[^"\\])*"\s*:)|("(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?)|\b(true|false)\b|\b(null)\b/g, (token, key, string, number, bool, nil) => {
        if (key) return `<span class="text-sky-300">${key}</span>`;
        if (string) return `<span class="text-emerald-300">${string}</span>`;
        if (number) return `<span class="text-amber-300">${number}</span>`;
        if (bool) return `<span class="text-violet-300">${bool}</span>`;
        return `<span class="text-rose-300">${nil}</span>`;
    });
}

export function PaperJsonEditor({
    endpoint,
    method = "PUT",
    initialJson,
    open,
    onClose,
    onSaved,
}: {
    endpoint: string;
    method?: "PUT" | "POST";
    initialJson?: unknown;
    open: boolean;
    onClose: () => void;
    onSaved?: (data?: unknown) => void;
}) {
    const [raw, setRaw] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        if (method === "POST") {
            setRaw(JSON.stringify(initialJson ?? {}, null, 2));
            setError(null);
            setMessage(null);
            return;
        }
        setBusy(true);
        setError(null);
        setMessage(null);
        fetch(endpoint)
            .then(async (response) => {
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(data.error ?? "Could not load paper JSON");
                return data;
            })
            .then((data) => setRaw(JSON.stringify(data.paper ?? data.json ?? data.exam ?? data, null, 2)))
            .catch((e) => setError(e instanceof Error ? e.message : "Could not load paper JSON"))
            .finally(() => setBusy(false));
    }, [endpoint, initialJson, method, open]);

    if (!open) return null;

    async function save() {
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            setError("Invalid JSON. Fix the syntax before saving.");
            return;
        }
        setBusy(true);
        setError(null);
        setMessage(null);
        try {
            const response = await fetch(endpoint, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(parsed),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error ?? "Could not save paper JSON");
            setMessage("Paper JSON saved.");
            onSaved?.(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save paper JSON");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3">
            <div className="flex max-h-[94vh] w-full max-w-5xl flex-col rounded-2xl border p-4 shadow-2xl" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-base font-semibold">Complete paper JSON</h2>
                        <p className="text-xs opacity-70">Edit the whole paper object, including its question order and content.</p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-full border px-3 py-1.5 text-xs ui-click" style={{ borderColor: "var(--border)" }}>Close</button>
                </div>
                {error ? <div className="mb-2 rounded-lg border border-red-500/50 bg-red-500/10 p-2 text-xs text-red-200">{error}</div> : null}
                {message ? <div className="mb-2 rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-2 text-xs text-emerald-200">{message}</div> : null}
                <div className="grid min-h-[55vh] flex-1 gap-3 lg:grid-cols-2">
                    <textarea
                        className="min-h-[55vh] resize-y rounded-xl border p-3 font-mono text-xs leading-5 outline-none"
                        style={{ borderColor: "rgba(56,189,248,.45)", background: "#0b1220", color: "#e2e8f0" }}
                        value={raw}
                        onChange={(e) => setRaw(e.target.value)}
                        disabled={busy && !raw}
                        spellCheck={false}
                        aria-label="Paper JSON editor"
                    />
                    <pre className="min-h-[55vh] overflow-auto rounded-xl border p-3 font-mono text-xs leading-5" style={{ borderColor: "rgba(167,139,250,.45)", background: "linear-gradient(135deg, #111827, #172554)", color: "#cbd5e1" }} dangerouslySetInnerHTML={{ __html: highlightedJson(raw || "// JSON preview") }} />
                </div>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button type="button" className="rounded-full border px-3 py-1.5 text-xs ui-click" style={{ borderColor: "var(--border)" }} onClick={() => { try { setRaw(JSON.stringify(JSON.parse(raw), null, 2)); setError(null); } catch { setError("Invalid JSON."); } }}>Format JSON</button>
                    <button type="button" className="rounded-full border px-3 py-1.5 text-xs ui-click" style={{ borderColor: "var(--border)" }} onClick={() => void navigator.clipboard.writeText(raw)}>Copy JSON</button>
                    <button type="button" className="rounded-full border px-4 py-1.5 text-xs font-semibold ui-click" style={{ borderColor: "rgba(59,130,246,.5)", background: "rgba(37,99,235,.85)", color: "white" }} onClick={() => void save()} disabled={busy}>{busy ? "Saving..." : "Save paper JSON"}</button>
                </div>
            </div>
        </div>
    );
}
