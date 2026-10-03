import { AttemptReportClient } from "@/components/report/AttemptReportClient";
import { isAdminUsername } from "@/server/admin";
import { getAuthUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { notFound, redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminCandidateAttemptReportPage(
    props: { params: Promise<{ userId: string; testId: string; attemptId: string }> },
) {
    const auth = await getAuthUser();
    if (!auth) redirect("/login");
    if (!isAdminUsername(auth.username)) redirect("/admin");

    const { userId, testId, attemptId } = await props.params;
    const attempt = await prisma.studentAttempt.findFirst({
        where: { id: attemptId, studentId: userId, testId },
        select: { id: true },
    });

    if (!attempt) notFound();

    return <AttemptReportClient attemptId={attemptId} adminMode />;
}
