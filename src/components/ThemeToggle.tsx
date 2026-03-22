"use client";

import { useEffect, useState } from "react";

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

    useEffect(() => {
        const stored = localStorage.getItem("theme") as Theme | null;
        if (stored === "light" || stored === "dark") {
            setTheme(stored);
            applyTheme(stored);
        }
    }, []);

    return (
        <label className="text-sm flex items-center gap-2">
            <span className="opacity-70">Theme</span>
            <select
                className="border rounded px-2 py-1 bg-transparent"
                value={theme}
                onChange={(e) => {
                    const next = e.target.value as Theme;
                    setTheme(next);
                    applyTheme(next);
                }}
                aria-label="Theme"
            >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
            </select>
        </label>
    );
}
