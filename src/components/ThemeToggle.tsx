"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Theme = "light" | "dark" | "system";

function applyTheme(theme: Theme) {
    const root = document.documentElement;
    if (theme === "system") {
        root.removeAttribute("data-theme");
        localStorage.removeItem("theme");
        return;
    }

    root.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
}

export function ThemeToggle() {
    const [theme, setTheme] = useState<Theme>("system");
    const [open, setOpen] = useState(false);
    const popoverRef = useRef<HTMLDivElement | null>(null);

    const themeLabel = useMemo(() => {
        if (theme === "light") return "Light";
        if (theme === "dark") return "Dark";
        return "System";
    }, [theme]);

    useEffect(() => {
        const stored = localStorage.getItem("theme") as Theme | null;
        if (stored === "light" || stored === "dark") {
            setTheme(stored);
            applyTheme(stored);
        }
    }, []);

    useEffect(() => {
        if (!open) return;

        const onMouseDown = (e: MouseEvent) => {
            const el = popoverRef.current;
            if (!el) return;
            if (e.target instanceof Node && !el.contains(e.target)) {
                setOpen(false);
            }
        };

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };

        document.addEventListener("mousedown", onMouseDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onMouseDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    function setThemeAndClose(next: Theme) {
        setTheme(next);
        applyTheme(next);
        setOpen(false);
    }

    return (
        <label className="text-sm flex items-center gap-2">
            <span className="opacity-70">Theme</span>
            <div className="relative" ref={popoverRef}>
                <button
                    type="button"
                    className="text-xs rounded-full border px-3 py-1 ui-click"
                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                    aria-haspopup="menu"
                    aria-expanded={open}
                    onClick={() => setOpen((v) => !v)}
                >
                    <span className="inline-flex items-center gap-2">
                        <span>{themeLabel}</span>
                        <span className="opacity-60" aria-hidden>
                            ▾
                        </span>
                    </span>
                </button>

                {open ? (
                    <div
                        role="menu"
                        className="absolute right-0 mt-2 min-w-36 rounded-lg border p-1"
                        style={{ borderColor: "var(--border)", background: "var(--card)" }}
                    >
                        <button
                            type="button"
                            role="menuitem"
                            className="w-full text-left text-sm rounded-md px-3 py-2 ui-click"
                            style={{ background: theme === "system" ? "var(--muted)" : "transparent" }}
                            onClick={() => setThemeAndClose("system")}
                        >
                            System
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            className="w-full text-left text-sm rounded-md px-3 py-2 ui-click"
                            style={{ background: theme === "light" ? "var(--muted)" : "transparent" }}
                            onClick={() => setThemeAndClose("light")}
                        >
                            Light
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            className="w-full text-left text-sm rounded-md px-3 py-2 ui-click"
                            style={{ background: theme === "dark" ? "var(--muted)" : "transparent" }}
                            onClick={() => setThemeAndClose("dark")}
                        >
                            Dark
                        </button>
                    </div>
                ) : null}
            </div>
        </label>
    );
}
