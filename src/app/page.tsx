import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getAuthUserId } from "@/server/auth";
import { LogoutButton } from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

export default async function Home() {
    const userId = await getAuthUserId();
    if (!userId) {
        redirect("/login");
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
    });

    const tests = await prisma.testSeries.findMany({
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            title: true,
            totalDurationMinutes: true,
            isAdvancedFormat: true,
            createdAt: true,
            _count: { select: { questions: true } },
        },
    });

    return (
        <div className="min-h-screen flex flex-col">
            <header className="border-b" style={{ borderColor: "var(--border)" }}>
                <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div>
                        <div className="text-lg font-semibold">JEE Test Series</div>
                        <div className="text-sm opacity-70">CBT-style mock platform</div>
                        <div className="text-xs opacity-60">Student: {user?.name ?? "—"}</div>
                    </div>
                    <div className="flex items-center gap-3">
                        <ThemeToggle />
                        <LogoutButton />
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto w-full px-4 py-8">
                <h1 className="text-2xl font-semibold">Available Tests</h1>
                <div className="mt-6 grid gap-3">
                    {tests.map((t) => (
                        <Link
                            key={t.id}
                            href={`/test/${t.id}`}
                            className="rounded-lg border p-4 hover:opacity-90"
                            style={{ borderColor: "var(--border)", background: "var(--card)" }}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="font-medium">{t.title}</div>
                                    <div className="text-sm opacity-70">
                                        {t._count.questions} questions · {t.totalDurationMinutes} min
                                        {t.isAdvancedFormat ? " · Advanced" : ""}
                                    </div>
                                </div>
                                <div className="text-sm underline">Start →</div>
                            </div>
                        </Link>
                    ))}
                    {tests.length === 0 ? (
                        <div className="text-sm opacity-70">
                            No tests found. Run DB migration + seed.
                        </div>
                    ) : null}
                </div>
            </main>
        </div>
    );
}
