import { AttemptReportClient } from "@/components/report/AttemptReportClient";
import { AdvanceV2ReportClient } from "@/components/report/AdvanceV2ReportClient";
import { getAuthUserId } from "@/server/auth";
import { isFinalAttemptStatus } from "@/server/attempt-access";
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
            select: { id: true, status: true },
        }),
        prisma.examV2Attempt.findFirst({
            where: { id: attemptId, userId },
            select: { id: true, status: true },
        }),
    ]);

    if (legacy) {
        if (legacy.status === "IN_PROGRESS") redirect(`/advance/${attemptId}`);
        if (!isFinalAttemptStatus(legacy.status)) notFound();
        return <AttemptReportClient attemptId={attemptId} />;
    }
    if (v2) {
        if (v2.status === "IN_PROGRESS") redirect(`/advance/${attemptId}`);
        if (!isFinalAttemptStatus(v2.status)) notFound();
        return <AdvanceV2ReportClient attemptId={attemptId} />;
    }
    return notFound();
}
