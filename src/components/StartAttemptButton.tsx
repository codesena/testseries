"use client";

import { getTestSeriesVariant } from "@/lib/assessment";
import { StartAssessmentButton } from "@/components/StartAssessmentButton";

export function StartAttemptButton({
    testId,
    isAdvancedFormat,
}: {
    testId: string;
    isAdvancedFormat: boolean;
}) {
    return (
        <StartAssessmentButton
            variant={getTestSeriesVariant(isAdvancedFormat)}
            assessmentId={testId}
        />
    );
}
