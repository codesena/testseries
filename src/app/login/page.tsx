"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiPost } from "@/lib/api";

export default function LoginPage() {
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    return (
        <div className="min-h-screen flex flex-col">
            <header className="border-b" style={{ borderColor: "var(--border)" }}>
                <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
                    <Link
                        href="/"
                        className="text-xs rounded-full border px-3 py-1 ui-click"
                        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                    >
                        ← Home
                    </Link>
                    <div className="text-sm opacity-70">Login</div>
                </div>
            </header>

            <main className="max-w-md mx-auto w-full px-4 py-8">
                <h1 className="text-2xl font-semibold">Login</h1>
                <div className="mt-2 text-sm opacity-70">
                    Username should be your mobile number. Password is your birth year (YYYY).
                </div>

                <form
                    className="mt-6 grid gap-3"
                    onSubmit={async (e) => {
                        e.preventDefault();
                        setError(null);
                        setLoading(true);
                        try {
                            await apiPost("/api/auth/login", { username, password });
                            router.push("/");
                        } catch (err) {
                            setError(
                                err instanceof Error
                                    ? err.message
                                    : "Login failed",
                            );
                        } finally {
                            setLoading(false);
                        }
                    }}
                >
                    <label className="grid gap-1">
                        <div className="text-sm font-medium">Username (Mobile No.)</div>
                        <input
                            className="rounded border px-3 py-2 ui-field"
                            style={{ borderColor: "var(--border)", background: "var(--card)" }}
                            inputMode="numeric"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="e.g. 9876543210"
                            required
                        />
                    </label>

                    <label className="grid gap-1">
                        <div className="text-sm font-medium">Password</div>
                        <input
                            className="rounded border px-3 py-2 ui-field"
                            style={{ borderColor: "var(--border)", background: "var(--card)" }}
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Your password"
                            required
                        />
                    </label>

                    <button
                        className="mt-2 px-4 py-2 rounded font-medium border ui-click"
                        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        disabled={loading}
                        type="submit"
                    >
                        {loading ? "Logging in…" : "Login"}
                    </button>

                    {error ? <div className="text-sm text-red-600">{error}</div> : null}

                    <div className="mt-2 text-sm opacity-80">
                        Don’t have an account?{" "}
                        <Link href="/signup" className="underline">
                            Signup
                        </Link>
                    </div>
                    <div className="text-sm opacity-80">
                        Forgot password?{" "}
                        <Link href="/reset-password" className="underline">
                            Reset password
                        </Link>
                    </div>
                </form>
            </main>
        </div>
    );
}
