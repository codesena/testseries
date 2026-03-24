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
            <header className="border-b" style={{ borderColor: "var(--border)" }}>
                <div className="max-w-3xl mx-auto px-4 py-4 flex items-center">
                    <Link
                        href="/"
                        className="text-xs rounded-full border px-3 py-1 ui-click"
                        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                    >
                        Back
                    </Link>
                </div>
            </header>

            <main className="max-w-3xl mx-auto w-full px-4 py-8">
                <h1 className="text-2xl font-semibold">{test.title}</h1>
                <div className="mt-2 text-sm opacity-70">
                    {test._count.questions} questions · {test.totalDurationMinutes} minutes
                    {test.isAdvancedFormat ? " · Advanced format" : ""}
                </div>

                <div
                    className="mt-6 rounded-lg border p-4"
                    style={{ borderColor: "var(--border)", background: "var(--card)" }}
                >
                    <div className="font-medium">Instructions</div>
                    <ul className="mt-2 text-sm opacity-80 list-disc pl-5 space-y-1">
                        <li>Test runs in full-screen mode for better focus.</li>
                        <li>Navigation uses a question palette + subject tabs.</li>
                        <li>Auto-save/heartbeat runs periodically; offline attempts are queued.</li>
                        <li>Tab switches and fullscreen exits are logged.</li>
                    </ul>
                </div>

                <div className="mt-6 flex items-center gap-3">
                    <StartAttemptButton testId={test.id} />
                    <Link
                        href="/"
                        className="text-sm underline opacity-80 hover:opacity-100"
                    >
                        Cancel
                    </Link>
                </div>
            </main>
        </div>
    );
}
