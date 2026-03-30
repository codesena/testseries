import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/server/auth";
import { isAdminUsername } from "@/server/admin";
import { AdminQuestionEditorClient } from "@/components/admin/AdminQuestionEditorClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminQuestionsPage() {
    const auth = await getAuthUser();
    if (!auth) redirect("/login");

    if (!isAdminUsername(auth.username)) {
        return (
            <div className="min-h-screen flex flex-col">
                <header
                    className="sticky top-0 z-50 border-b"
                    style={{ borderColor: "var(--border)", background: "var(--background)" }}
                >
                    <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
                        <Link
                            href="/"
                            className="text-xs rounded-full border px-3 py-1 ui-click"
                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        >
                            Home
                        </Link>
                        <div className="text-sm opacity-70">Admin</div>
                    </div>
                </header>

                <main className="max-w-6xl mx-auto w-full px-4 py-8">
                    <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                        <div className="text-sm font-medium">Access denied</div>
                        <div className="mt-1 text-sm opacity-70">Your account is not allowed to manage questions.</div>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col">
            <header
                className="sticky top-0 z-50 border-b"
                style={{ borderColor: "var(--border)", background: "var(--background)" }}
            >
                <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link
                            href="/admin"
                            className="text-xs rounded-full border px-3 py-1 ui-click"
                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        >
                            ← Admin
                        </Link>
                        <Link
                            href="/"
                            className="text-xs rounded-full border px-3 py-1 ui-click"
                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        >
                            Home
                        </Link>
                    </div>
                    <div className="text-sm opacity-70">Question Editor</div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto w-full px-4 py-8">
                <h1 className="text-2xl font-semibold">Question Raw Editor</h1>
                <div className="mt-2 text-sm opacity-70">
                    Edit complete raw question data and preview the rendered result before saving.
                </div>

                <div className="mt-6">
                    <AdminQuestionEditorClient />
                </div>
            </main>
        </div>
    );
}
