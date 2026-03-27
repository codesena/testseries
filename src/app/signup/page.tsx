"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { apiPost } from "@/lib/api";

export default function SignupPage() {
    const router = useRouter();

    const [name, setName] = useState("");
    const [username, setUsername] = useState("");
    const [birthYear, setBirthYear] = useState("");

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const initialPassword = useMemo(() => birthYear.trim(), [birthYear]);

    return (
        <div className="min-h-screen flex flex-col">
            <header
                className="sticky top-0 z-50 border-b"
                style={{ borderColor: "var(--border)", background: "var(--background)" }}
            >
                <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
                    <Link
                        href="/"
                        className="text-xs rounded-full border px-3 py-1 ui-click"
                        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                    >
                        ← Home
                    </Link>
                    <div className="text-sm opacity-70">Signup</div>
                </div>
            </header>

            <main className="max-w-md mx-auto w-full px-4 py-8">
                <h1 className="text-2xl font-semibold">Create Account</h1>
                <div className="mt-2 text-sm opacity-70">
                    Username should be your mobile number. Password will be your birth year (YYYY).
                </div>

                <form
                    className="mt-6 grid gap-3"
                    onSubmit={async (e) => {
                        e.preventDefault();
                        setError(null);
                        setLoading(true);
                        try {
                            await apiPost("/api/auth/signup", {
                                name,
                                username,
                                password: initialPassword,
                            });
                            router.push("/login");
                        } catch (err) {
                            setError(
                                err instanceof Error
                                    ? err.message
                                    : "Signup failed",
                            );
                        } finally {
                            setLoading(false);
                        }
                    }}
                >
                    <label className="grid gap-1">
                        <div className="text-sm font-medium">Name</div>
                        <input
                            className="rounded border px-3 py-2 ui-field"
                            style={{ borderColor: "var(--border)", background: "var(--card)" }}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Your name"
                            required
                        />
                    </label>

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
                        <div className="text-xs opacity-60">Use 10–15 digits.</div>
                    </label>

                    <label className="grid gap-1">
                        <div className="text-sm font-medium">Year of Birth (Password)</div>
                        <input
                            className="rounded border px-3 py-2 ui-field"
                            style={{ borderColor: "var(--border)", background: "var(--card)" }}
                            inputMode="numeric"
                            value={birthYear}
                            onChange={(e) => setBirthYear(e.target.value)}
                            placeholder="e.g. 2006"
                            required
                        />
                        <div className="text-xs opacity-60">Initial password will be set to this value (YYYY).</div>
                    </label>

                    <button
                        className="mt-2 px-4 py-2 rounded font-medium border ui-click"
                        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        disabled={loading}
                        type="submit"
                    >
                        {loading ? "Creating…" : "Create Account"}
                    </button>

                    {error ? <div className="text-sm text-red-600">{error}</div> : null}

                    <div className="mt-2 text-sm opacity-80">
                        Already have an account?{" "}
                        <Link href="/login" className="underline">
                            Login
                        </Link>
                    </div>
                </form>
            </main>
        </div>
    );
}
