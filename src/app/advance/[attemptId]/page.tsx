import { ExamClient } from "@/components/exam/ExamClient";
import { AdvanceV2ExamClient } from "@/components/exam/AdvanceV2ExamClient";
import { getAuthUserId } from "@/server/auth";
import { isFinalAttemptStatus } from "@/server/attempt-access";
import { prisma } from "@/server/db";
import { notFound, redirect } from "next/navigation";

export default async function AdvanceAttemptPage({
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
        if (isFinalAttemptStatus(legacy.status)) redirect(`/advance/${attemptId}/report`);
        if (legacy.status !== "IN_PROGRESS") notFound();
        return <ExamClient attemptId={attemptId} />;
    }
    if (v2) {
        if (isFinalAttemptStatus(v2.status)) redirect(`/advance/${attemptId}/report`);
        if (v2.status !== "IN_PROGRESS") notFound();
        return <AdvanceV2ExamClient attemptId={attemptId} />;
    }
    return notFound();
}
