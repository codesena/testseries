import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { StartAttemptButton } from "@/components/StartAttemptButton";

export const dynamic = "force-dynamic";

export default async function TestStartPage({
    params,
}: {
    params: Promise<{ testId: string }>;
}) {
    const { testId } = await params;
    const test = await prisma.testSeries.findUnique({
        where: { id: testId },
        select: {
            id: true,
            title: true,
            totalDurationMinutes: true,
            isAdvancedFormat: true,
            _count: { select: { questions: true } },
        },
    });

    if (!test) return notFound();

    return (
        <div className="min-h-screen flex flex-col">
            <header
                className="sticky top-0 z-50 border-b backdrop-blur-md"
                style={{
                    borderColor: "var(--border)",
                    background: "color-mix(in srgb, var(--background) 88%, transparent)",
                }}
            >
                <div className="max-w-5xl mx-auto px-4 py-2">
                    <div className="rounded-2xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                        <div className="flex flex-nowrap items-center gap-3 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                            <div className="min-w-0 flex items-center gap-2 shrink-0">
                                <div
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold shrink-0"
                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                >
                                    J
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[1.22rem] sm:text-[clamp(1.35rem,2.6vw,1.7rem)] font-semibold leading-none">JEE Test Series</div>
                                    <div className="hidden sm:block text-[11px] leading-tight" style={{ color: "var(--foreground)", opacity: 0.8 }}>
                                        Read instructions, then begin when ready.
                                    </div>
                                </div>
                            </div>

                            <Link
                                href="/"
                                className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click ml-auto shrink-0"
                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                            >
                                Back
                            </Link>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto w-full px-4 pt-8 pb-16">
                <section className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                    <h1 className="text-2xl font-semibold leading-snug">{test.title}</h1>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                        <span
                            className="inline-flex items-center justify-center h-7 rounded-full border px-2.5 whitespace-nowrap"
                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        >
                            {test.isAdvancedFormat ? "JEE Advanced" : "JEE Main"}
                        </span>
                        <span className="opacity-60">{test._count.questions} questions</span>
                        <span className="opacity-60">{test.totalDurationMinutes} minutes</span>
                    </div>

                    <div
                        className="mt-6 rounded-2xl border p-4"
                        style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--muted) 55%, transparent)" }}
                    >
                        <div className="font-medium">Instructions</div>
                        <ul className="mt-2 text-sm opacity-80 list-disc pl-5 space-y-1">
                            <li>Use the Enter Fullscreen button inside the exam header when ready.</li>
                            <li>Navigation uses a question palette + subject tabs.</li>
                            <li>Auto-save/heartbeat runs periodically; offline attempts are queued.</li>
                            <li>Tab switches and fullscreen exits are logged.</li>
                        </ul>
                    </div>

                    <div className="mt-6 flex flex-wrap items-center gap-3">
                        <StartAttemptButton testId={test.id} isAdvancedFormat={test.isAdvancedFormat} />
                        <Link
                            href="/"
                            className="inline-flex items-center justify-center h-10 rounded-full border px-4 text-sm whitespace-nowrap ui-click"
                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        >
                            Cancel
                        </Link>
                    </div>
                </section>
            </main>
        </div>
    );
}
