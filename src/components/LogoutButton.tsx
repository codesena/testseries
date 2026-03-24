"use client";

import { useState } from "react";

export function LogoutButton() {
    const [loggingOut, setLoggingOut] = useState(false);

    return (
        <button
            className="px-3 py-1.5 rounded border text-sm ui-click"
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
