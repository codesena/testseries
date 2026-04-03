"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function getSystemTheme(): Theme {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
}

export function ThemeIconToggle() {
    const [theme, setTheme] = useState<Theme>("light");

    useEffect(() => {
        const stored = localStorage.getItem("theme");
        if (stored === "dark" || stored === "light") {
            setTheme(stored);
            applyTheme(stored);
            return;
        }

        const systemTheme = getSystemTheme();
        setTheme(systemTheme);
        applyTheme(systemTheme);
    }, []);

    const isDark = theme === "dark";

    return (
        <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border text-base ui-click"
            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
            aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
            onClick={() => {
                const nextTheme: Theme = isDark ? "light" : "dark";
                setTheme(nextTheme);
                applyTheme(nextTheme);
            }}
        >
            <span aria-hidden>{isDark ? "☀" : "☾"}</span>
        </button>
    );
}
