import { ExamClient } from "@/components/exam/ExamClient";
import { getAuthUser } from "@/server/auth";
import { isFinalAttemptStatus } from "@/server/attempt-access";
import { prisma } from "@/server/db";
import { notFound, redirect } from "next/navigation";

export default async function AttemptPage({
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
    if (isFinalAttemptStatus(attempt.status)) redirect(`/attempt/${attemptId}/report`);
    if (attempt.status !== "IN_PROGRESS") notFound();

    return <ExamClient attemptId={attemptId} />;
}
