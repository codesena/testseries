import { AttemptReportClient } from "@/components/report/AttemptReportClient";
import { AdvanceV2ReportClient } from "@/components/report/AdvanceV2ReportClient";
import { getAuthUserId } from "@/server/auth";
import { prisma } from "@/server/db";
import { notFound, redirect } from "next/navigation";

export default async function AdvanceAttemptReportPage({
    params,
}: {
    params: Promise<{ attemptId: string }>;
}) {
    const { attemptId } = await params;
    const userId = await getAuthUserId();
    if (!userId) redirect("/login");

    const [legacy, v2] = await Promise.all([
        prisma.studentAttempt.findFirst({
            where: { id: attemptId, studentId: userId },
            select: { id: true },
        }),
        prisma.examV2Attempt.findFirst({
            where: { id: attemptId, userId },
            select: { id: true },
        }),
    ]);

    if (legacy) return <AttemptReportClient attemptId={attemptId} />;
    if (v2) return <AdvanceV2ReportClient attemptId={attemptId} />;
    return notFound();
}
