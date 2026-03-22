import { AttemptReportClient } from "@/components/report/AttemptReportClient";

export default async function AttemptReportPage({
    params,
}: {
    params: Promise<{ attemptId: string }>;
}) {
    const { attemptId } = await params;
    return <AttemptReportClient attemptId={attemptId} />;
}
