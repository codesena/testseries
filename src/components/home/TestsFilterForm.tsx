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
                placeholder="Search tests"
                className="h-10 rounded-full border px-4 bg-transparent ui-field text-sm"
                style={{ borderColor: "var(--border)" }}
            />
            <select
                name="status"
                defaultValue={rawStatus}
                className="h-10 rounded-full border px-4 bg-transparent ui-field text-sm"
                style={{ borderColor: "var(--border)" }}
                onChange={(e) => submitFromSelect(e.currentTarget)}
            >
                <option value="all">All status</option>
                <option value="attempted">Attempted</option>
                <option value="unattempted">Unattempted</option>
            </select>
            <select
                name="format"
                defaultValue={rawFormat}
                className="h-10 rounded-full border px-4 bg-transparent ui-field text-sm"
                style={{ borderColor: "var(--border)" }}
                onChange={(e) => submitFromSelect(e.currentTarget)}
            >
                <option value="all">All formats</option>
                <option value="main">JEE Main</option>
                <option value="advanced">JEE Advanced</option>
            </select>
        </form>
    );
}
