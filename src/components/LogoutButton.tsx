"use client";

import { useState } from "react";

export function LogoutButton() {
    const [loggingOut, setLoggingOut] = useState(false);

    return (
        <button
            className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
            disabled={loggingOut}
            onClick={async () => {
                try {
                    setLoggingOut(true);
                    await fetch("/api/auth/logout", { method: "POST" });
                } finally {
                    window.location.href = "/login";
                }
            }}
        >
            {loggingOut ? "Logging out…" : "Logout"}
        </button>
    );
}
