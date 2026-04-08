"use client";

type TestsFilterFormProps = {
    rawQ: string;
    rawStatus: string;
    rawFormat: string;
};

export function TestsFilterForm({ rawQ, rawStatus, rawFormat }: TestsFilterFormProps) {
    const submitFromSelect = (el: HTMLSelectElement) => {
        el.form?.requestSubmit();
    };

    return (
        <form className="mt-4 grid gap-2 sm:grid-cols-[1fr_170px_170px]" method="GET">
            <input
                name="q"
                defaultValue={rawQ}
                placeholder="Search papers"
                className="h-10 rounded-full border px-4 bg-transparent ui-field text-sm"
                style={{ borderColor: "var(--border)" }}
            />

            <div className="relative">
                <select
                    name="status"
                    defaultValue={rawStatus}
                    className="h-10 w-full rounded-full border pl-4 pr-12 bg-transparent ui-field text-sm appearance-none"
                    style={{ borderColor: "var(--border)" }}
                    onChange={(e) => submitFromSelect(e.currentTarget)}
                >
                    <option value="all">All status</option>
                    <option value="attempted">Attempted</option>
                    <option value="unattempted">Unattempted</option>
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-4 inline-flex items-center" style={{ color: "var(--foreground)", opacity: 0.75 }} aria-hidden>
                    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 8l4 4 4-4" />
                    </svg>
                </span>
            </div>

            <div className="relative">
                <select
                    name="format"
                    defaultValue={rawFormat}
                    className="h-10 w-full rounded-full border pl-4 pr-12 bg-transparent ui-field text-sm appearance-none"
                    style={{ borderColor: "var(--border)" }}
                    onChange={(e) => submitFromSelect(e.currentTarget)}
                >
                    <option value="all">All formats</option>
                    <option value="main">JEE Main</option>
                    <option value="advanced">JEE Advanced</option>
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-4 inline-flex items-center" style={{ color: "var(--foreground)", opacity: 0.75 }} aria-hidden>
                    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 8l4 4 4-4" />
                    </svg>
                </span>
            </div>
        </form>
    );
}
