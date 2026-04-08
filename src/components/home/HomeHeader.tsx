"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogoutButton } from "@/components/LogoutButton";
import { ThemeIconToggle } from "@/components/home/ThemeIconToggle";

type HomeHeaderProps = {
    isAdmin: boolean;
    userInitial: string;
    userName: string;
};

export function HomeHeader({ isAdmin, userInitial, userName }: HomeHeaderProps) {
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [activeSection, setActiveSection] = useState<"dashboard" | "history" | "tests">("dashboard");
    const mobileNavRef = useRef<HTMLDivElement | null>(null);
    const profileRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const onMouseDown = (event: MouseEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;

            if (mobileNavRef.current && !mobileNavRef.current.contains(target)) {
                setIsMobileNavOpen(false);
            }
            if (profileRef.current && !profileRef.current.contains(target)) {
                setIsProfileOpen(false);
            }
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsMobileNavOpen(false);
                setIsProfileOpen(false);
            }
        };

        document.addEventListener("mousedown", onMouseDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onMouseDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, []);

    useEffect(() => {
        const sectionIds = ["dashboard", "tests", "history"] as const;
        const sections = sectionIds
            .map((id) => document.getElementById(id))
            .filter((el): el is HTMLElement => Boolean(el));

        if (!sections.length) return;

        const computeActiveSection = () => {
            const y = window.scrollY + 180;
            let current: "dashboard" | "tests" | "history" = "dashboard";

            for (const section of sections) {
                if (section.offsetTop <= y) {
                    current = section.id as "dashboard" | "tests" | "history";
                }
            }

            setActiveSection(current);
        };

        computeActiveSection();
        window.addEventListener("scroll", computeActiveSection, { passive: true });
        window.addEventListener("hashchange", computeActiveSection);

        return () => {
            window.removeEventListener("scroll", computeActiveSection);
            window.removeEventListener("hashchange", computeActiveSection);
        };
    }, []);

    return (
        <header
            className="sticky top-0 z-50 border-b backdrop-blur-md"
            style={{
                borderColor: "var(--border)",
                background: "color-mix(in srgb, var(--background) 88%, transparent)",
            }}
        >
            <div className="max-w-5xl mx-auto px-3 sm:px-4 py-1.5">
                <div className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex items-center gap-2">
                            <div
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold shrink-0"
                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                            >
                                J
                            </div>
                            <div className="min-w-0">
                                <div className="text-sm sm:text-base font-semibold leading-none">JEE Test Series</div>
                                <div className="hidden sm:block text-[11px] leading-tight" style={{ color: "var(--foreground)", opacity: 0.8 }}>
                                    Practice. Analyze. Improve.
                                </div>
                            </div>
                        </div>

                        <nav className="hidden lg:flex items-center gap-1">
                            <Link
                                href="#dashboard"
                                className="inline-flex items-center justify-center h-8 rounded-full border px-2.5 text-[11px] whitespace-nowrap ui-click"
                                style={
                                    activeSection === "dashboard"
                                        ? {
                                            borderColor: "rgba(59, 130, 246, 0.5)",
                                            background: "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(14,165,233,0.9))",
                                            color: "#e0f2fe",
                                        }
                                        : { borderColor: "var(--border)", background: "transparent" }
                                }
                            >
                                Dashboard
                            </Link>
                            <Link
                                href="#tests"
                                className="inline-flex items-center justify-center h-8 rounded-full border px-2.5 text-[11px] whitespace-nowrap ui-click"
                                style={
                                    activeSection === "tests"
                                        ? {
                                            borderColor: "rgba(59, 130, 246, 0.5)",
                                            background: "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(14,165,233,0.9))",
                                            color: "#e0f2fe",
                                        }
                                        : { borderColor: "var(--border)", background: "transparent" }
                                }
                            >
                                Papers
                            </Link>
                            <Link
                                href="#history"
                                className="inline-flex items-center justify-center h-8 rounded-full border px-2.5 text-[11px] whitespace-nowrap ui-click"
                                style={
                                    activeSection === "history"
                                        ? {
                                            borderColor: "rgba(59, 130, 246, 0.5)",
                                            background: "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(14,165,233,0.9))",
                                            color: "#e0f2fe",
                                        }
                                        : { borderColor: "var(--border)", background: "transparent" }
                                }
                            >
                                Attempted History
                            </Link>
                        </nav>

                        <div className="flex items-center gap-2 shrink-0">
                            <ThemeIconToggle />

                            {isAdmin ? (
                                <Link
                                    href="/admin"
                                    className="hidden md:inline-flex items-center justify-center h-8 rounded-full border px-2.5 text-[11px] whitespace-nowrap ui-click"
                                    style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--muted) 70%, black 30%)" }}
                                >
                                    ⇄ Switch to Admin
                                </Link>
                            ) : null}

                            <div className="relative md:hidden" ref={mobileNavRef}>
                                <button
                                    type="button"
                                    className="inline-flex items-center justify-center h-8 w-8 rounded-full border text-sm ui-click"
                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                    aria-label="Open navigation menu"
                                    aria-expanded={isMobileNavOpen}
                                    onClick={() => setIsMobileNavOpen((v) => !v)}
                                >
                                    ☰
                                </button>
                                {isMobileNavOpen ? (
                                    <div
                                        className="absolute right-0 mt-2 min-w-44 rounded-xl border p-1.5 flex flex-col gap-1 z-50"
                                        style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                    >
                                        <Link href="#dashboard" className="inline-flex items-center h-8 rounded-lg px-3 text-sm ui-click" style={{ background: "transparent" }} onClick={() => setIsMobileNavOpen(false)}>
                                            Dashboard
                                        </Link>
                                        <Link href="#tests" className="inline-flex items-center h-8 rounded-lg px-3 text-sm ui-click" style={{ background: "transparent" }} onClick={() => setIsMobileNavOpen(false)}>
                                            Papers
                                        </Link>
                                        <Link href="#history" className="inline-flex items-center h-8 rounded-lg px-3 text-sm ui-click" style={{ background: "transparent" }} onClick={() => setIsMobileNavOpen(false)}>
                                            Attempted History
                                        </Link>
                                    </div>
                                ) : null}
                            </div>

                            <div className="relative" ref={profileRef}>
                                <button
                                    type="button"
                                    className="inline-flex items-center justify-center h-8 w-8 rounded-full border text-[11px] font-semibold ui-click"
                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                    aria-label="Open account menu"
                                    aria-expanded={isProfileOpen}
                                    onClick={() => setIsProfileOpen((v) => !v)}
                                >
                                    {userInitial}
                                </button>
                                {isProfileOpen ? (
                                    <div
                                        className="absolute right-0 mt-2 min-w-40 rounded-xl border p-1.5 flex flex-col gap-1.5 z-50"
                                        style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                    >
                                        <div className="px-2 py-1 text-xs opacity-70">{userName}</div>
                                        {isAdmin ? (
                                            <Link
                                                href="/admin"
                                                className="md:hidden inline-flex items-center h-8 rounded-lg px-3 text-sm ui-click"
                                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                                onClick={() => setIsProfileOpen(false)}
                                            >
                                                ⇄ Switch to Admin
                                            </Link>
                                        ) : null}
                                        <LogoutButton />
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
}
