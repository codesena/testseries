import { AttemptReportClient } from "@/components/report/AttemptReportClient";
import { getAuthUser } from "@/server/auth";
import { isFinalAttemptStatus } from "@/server/attempt-access";
import { prisma } from "@/server/db";
import { notFound, redirect } from "next/navigation";

export default async function AttemptReportPage({
    params,
}: {
    params: Promise<{ attemptId: string }>;
}) {
    const { attemptId } = await params;
    const auth = await getAuthUser();
    if (!auth) redirect("/login");

    const attempt = await prisma.studentAttempt.findFirst({
        where: { id: attemptId, studentId: auth.userId },
        select: { id: true, status: true },
    });
    if (!attempt) notFound();
    if (attempt.status === "IN_PROGRESS") redirect(`/attempt/${attemptId}`);
    if (!isFinalAttemptStatus(attempt.status)) notFound();

    return <AttemptReportClient attemptId={attemptId} />;
}
