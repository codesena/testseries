import Link from "next/link";
import { notFound } from "next/navigation";
import {
    getAssessmentHistoryPath,
    getAssessmentLabel,
    getTestSeriesVariant,
} from "@/lib/assessment";
import { SlimPageHeader, getSlimHeaderPillStyle, slimHeaderPillClassName } from "@/components/common/SlimPageHeader";
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

    const variant = getTestSeriesVariant(test.isAdvancedFormat);

    return (
        <div className="min-h-screen flex flex-col">
            <SlimPageHeader
                badgeLabel={variant === "main" ? "M" : "A"}
                title={getAssessmentLabel(variant)}
                subtitle="Review instructions, then begin when ready."
                actions={
                    <>
                        <Link
                            href="/"
                            className={slimHeaderPillClassName}
                            style={getSlimHeaderPillStyle()}
                        >
                            Home
                        </Link>
                        <Link
                            href={getAssessmentHistoryPath(variant, test.id)}
                            className={slimHeaderPillClassName}
                            style={getSlimHeaderPillStyle()}
                        >
                            History
                        </Link>
                    </>
                }
            />

            <main className="max-w-5xl mx-auto w-full px-4 pt-8 pb-16">
                <section className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                    <h1 className="text-2xl font-semibold leading-snug">{test.title}</h1>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                        <span
                            className="inline-flex items-center justify-center h-7 rounded-full border px-2.5 whitespace-nowrap"
                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        >
                            {getAssessmentLabel(variant)}
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
