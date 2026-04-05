import { redirect, notFound } from "next/navigation";
import { AdvanceV2ReportClient } from "@/components/report/AdvanceV2ReportClient";
import { getAuthUser } from "@/server/auth";
import { isAdminUsername } from "@/server/admin";
import { prisma } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminCandidateAdvancedAttemptReportPage(
    props: { params: Promise<{ userId: string; examId: string; attemptId: string }> },
) {
    const auth = await getAuthUser();
    if (!auth) redirect("/login");
    if (!isAdminUsername(auth.username)) redirect("/admin");

    const { userId, examId, attemptId } = await props.params;

    const attempt = await prisma.examV2Attempt.findFirst({
        where: {
            id: attemptId,
            userId,
            examId,
        },
        select: { id: true },
    });

    if (!attempt) notFound();

    return <AdvanceV2ReportClient attemptId={attemptId} />;
}
