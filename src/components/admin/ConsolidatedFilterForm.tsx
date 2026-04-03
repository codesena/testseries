"use client";

import { usePathname, useRouter } from "next/navigation";

type TestChoice = {
    id: string;
    title: string;
    createdAt: string;
};

type AttemptChoice = {
    id: string;
    studentName: string;
    studentUsername: string;
    status: string;
    overallScore: number | null;
    startTimestamp: string;
    endTimestamp: string | null;
};

function fmtDate(iso: string | null): string {
    if (!iso) return "-";
    try {
        return new Intl.DateTimeFormat("en-IN", {
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Kolkata",
        }).format(new Date(iso));
    } catch {
        return iso;
    }
}

export function ConsolidatedFilterForm({
    tests,
    selectedTestId,
    attemptChoices,
    selectedAttemptIds,
}: {
    tests: TestChoice[];
    selectedTestId: string;
    attemptChoices: AttemptChoice[];
    selectedAttemptIds: string[];
}) {
    const router = useRouter();
    const pathname = usePathname();

    return (
        <form
            method="get"
            className="mt-6 rounded-2xl border p-4 sm:p-5"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}
        >
            <div className="grid gap-4 lg:grid-cols-[1fr,2fr]">
                <label className="block text-sm">
                    <div className="text-xs opacity-70">Select paper</div>
                    <div className="relative mt-2">
                        <select
                            name="testId"
                            value={selectedTestId}
                            className="w-full h-10 rounded-full border pl-4 pr-12 bg-transparent ui-field appearance-none"
                            style={{ borderColor: "var(--border)" }}
                            onChange={(e) => {
                                const nextTestId = e.target.value;
                                const params = new URLSearchParams();
                                params.set("testId", nextTestId);
                                router.replace(`${pathname}?${params.toString()}`);
                            }}
                        >
                            {tests.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.title} ({fmtDate(t.createdAt)})
                                </option>
                            ))}
                        </select>
                        <span className="pointer-events-none absolute inset-y-0 right-4 inline-flex items-center" style={{ color: "var(--foreground)", opacity: 0.75 }} aria-hidden>
                            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M6 8l4 4 4-4" />
                            </svg>
                        </span>
                    </div>
                </label>

                <div className="text-sm">
                    <div className="text-xs opacity-70">Select attempts (multiple students allowed)</div>
                    <div className="mt-2 max-h-56 overflow-auto rounded-xl border p-2" style={{ borderColor: "var(--border)" }}>
                        {attemptChoices.length ? (
                            <div className="grid gap-2">
                                {attemptChoices.map((a) => (
                                    <label
                                        key={a.id}
                                        className="rounded-xl border px-3 py-2 flex items-start gap-3"
                                        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                    >
                                        <input
                                            type="checkbox"
                                            name="attemptIds"
                                            value={a.id}
                                            defaultChecked={selectedAttemptIds.includes(a.id)}
                                        />
                                        <span className="text-xs leading-relaxed">
                                            {a.studentName} ({a.studentUsername}) · Attempt {a.id.slice(0, 8)} · {a.status} · Score {a.overallScore ?? "-"}
                                            <br />
                                            Start {fmtDate(a.startTimestamp)} · End {fmtDate(a.endTimestamp)}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        ) : (
                            <div className="text-xs opacity-70">No attempts found for selected paper.</div>
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-4">
                <button
                    type="submit"
                    className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                    style={{
                        borderColor: "rgba(59, 130, 246, 0.5)",
                        background: "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(14,165,233,0.9))",
                        color: "#e0f2fe",
                    }}
                >
                    Load consolidated view
                </button>
            </div>
        </form>
    );
}
