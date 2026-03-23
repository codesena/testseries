"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiPost } from "@/lib/api";

export default function ResetPasswordPage() {
    const router = useRouter();

    const [username, setUsername] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    return (
        <div className="min-h-screen flex flex-col">
            <header className="border-b" style={{ borderColor: "var(--border)" }}>
                <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
                    <Link href="/login" className="text-sm underline">
                        ← Back
                    </Link>
                    <div className="text-sm opacity-70">Reset Password</div>
                </div>
            </header>

            <main className="max-w-md mx-auto w-full px-4 py-8">
                <h1 className="text-2xl font-semibold">Reset Password</h1>
                <div className="mt-2 text-sm opacity-70">
                    Reset using your username (mobile number).
                </div>

                <form
                    className="mt-6 grid gap-3"
                    onSubmit={async (e) => {
                        e.preventDefault();
                        setError(null);
                        setLoading(true);
                        try {
                            await apiPost("/api/auth/reset-password", {
                                username,
                                newPassword,
                            });
                            router.push("/login");
                        } catch (err) {
                            setError(
                                err instanceof Error
                                    ? err.message
                                    : "Reset failed",
                            );
                        } finally {
                            setLoading(false);
                        }
                    }}
                >
                    <label className="grid gap-1">
                        <div className="text-sm font-medium">Username (Mobile No.)</div>
                        <input
                            className="rounded border px-3 py-2"
                            style={{ borderColor: "var(--border)", background: "var(--card)" }}
                            inputMode="numeric"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="e.g. 9876543210"
                            required
                        />
                    </label>

                    <label className="grid gap-1">
                        <div className="text-sm font-medium">New Password</div>
                        <input
                            className="rounded border px-3 py-2"
                            style={{ borderColor: "var(--border)", background: "var(--card)" }}
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Set a new password"
                            required
                        />
                    </label>

                    <button
                        className="mt-2 px-4 py-2 rounded font-medium border"
                        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        disabled={loading}
                        type="submit"
                    >
                        {loading ? "Resetting…" : "Reset Password"}
                    </button>

                    {error ? <div className="text-sm text-red-600">{error}</div> : null}

                    <div className="mt-2 text-sm opacity-80">
                        Back to{" "}
                        <Link href="/login" className="underline">
                            Login
                        </Link>
                    </div>
                </form>
            </main>
        </div>
    );
}
