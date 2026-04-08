import type { CSSProperties, ReactNode } from "react";

export const slimHeaderPillClassName =
    "inline-flex h-8 shrink-0 items-center justify-center rounded-full border px-3 text-[11px] sm:text-xs whitespace-nowrap ui-click";

export function getSlimHeaderPillStyle(
    tone: "muted" | "accent" | "ghost" = "muted",
): CSSProperties {
    if (tone === "accent") {
        return {
            borderColor: "rgba(59, 130, 246, 0.5)",
            background: "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(14,165,233,0.9))",
            color: "#e0f2fe",
        };
    }

    if (tone === "ghost") {
        return {
            borderColor: "var(--border)",
            background: "transparent",
        };
    }

    return {
        borderColor: "var(--border)",
        background: "var(--muted)",
    };
}

export function SlimPageHeader({
    badgeLabel,
    title,
    subtitle,
    actions,
    maxWidthClassName = "max-w-5xl",
}: {
    badgeLabel?: string;
    title: string;
    subtitle?: string;
    actions?: ReactNode;
    maxWidthClassName?: string;
}) {
    return (
        <header
            className="sticky top-0 z-50 border-b backdrop-blur-md"
            style={{
                borderColor: "var(--border)",
                background: "color-mix(in srgb, var(--background) 88%, transparent)",
            }}
        >
            <div className={`${maxWidthClassName} mx-auto px-3 sm:px-4 py-1.5`}>
                <div
                    className="rounded-xl border px-3 py-2"
                    style={{ borderColor: "var(--border)", background: "var(--card)" }}
                >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex items-center gap-2">
                            {badgeLabel ? (
                                <div
                                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold"
                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                >
                                    {badgeLabel}
                                </div>
                            ) : null}
                            <div className="min-w-0">
                                <div className="truncate text-sm sm:text-base font-semibold leading-tight">{title}</div>
                                {subtitle ? (
                                    <div
                                        className="hidden sm:block text-[11px] leading-tight"
                                        style={{ color: "var(--foreground)", opacity: 0.78 }}
                                    >
                                        {subtitle}
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        {actions ? (
                            <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto whitespace-nowrap pr-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:justify-end">
                                {actions}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </header>
    );
}
