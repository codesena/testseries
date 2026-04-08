"use client";

import { StartAssessmentButton } from "@/components/StartAssessmentButton";

export function StartV2AttemptButton({ examId }: { examId: string }) {
    return <StartAssessmentButton variant="advancedV2" assessmentId={examId} />;
}
