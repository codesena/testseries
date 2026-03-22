import { ExamClient } from "@/components/exam/ExamClient";

export default async function AttemptPage({
    params,
}: {
    params: Promise<{ attemptId: string }>;
}) {
    const { attemptId } = await params;
    return <ExamClient attemptId={attemptId} />;
}
