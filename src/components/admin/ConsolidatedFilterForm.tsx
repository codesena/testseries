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
        return new Intl.DateTimeFormat(undefined, {
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
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
            className="mt-6 rounded-lg border p-4"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}
        >
            <div className="grid gap-4 lg:grid-cols-[1fr,2fr]">
                <label className="block text-sm">
                    <div className="text-xs opacity-70">Select paper</div>
                    <select
                        name="testId"
                        value={selectedTestId}
                        className="mt-2 w-full rounded border px-3 py-2 bg-transparent ui-field"
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
                </label>

                <div className="text-sm">
                    <div className="text-xs opacity-70">Select attempts (multiple students allowed)</div>
                    <div className="mt-2 max-h-56 overflow-auto rounded border p-2" style={{ borderColor: "var(--border)" }}>
                        {attemptChoices.length ? (
                            <div className="grid gap-2">
                                {attemptChoices.map((a) => (
                                    <label
                                        key={a.id}
                                        className="rounded border px-3 py-2 flex items-start gap-3"
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
                    className="text-xs rounded-full border px-3 py-1 ui-click"
                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                >
                    Load consolidated view
                </button>
            </div>
        </form>
    );
}
