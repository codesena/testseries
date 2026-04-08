export type AssessmentVariant = "main" | "advancedLegacy" | "advancedV2";

export type AssessmentFamily = "main" | "advanced";

type AssessmentVariantMeta = {
    variant: AssessmentVariant;
    family: AssessmentFamily;
    label: string;
    shortLabel: string;
    startPath: (id: string) => string;
    historyPath: (id: string) => string;
    attemptPath: (attemptId: string) => string;
    reportPath: (attemptId: string) => string;
    adminPaperPath: (id: string) => string;
    adminCandidatePaperPath: (userId: string, id: string) => string;
};

const ASSESSMENT_META: Record<AssessmentVariant, AssessmentVariantMeta> = {
    main: {
        variant: "main",
        family: "main",
        label: "JEE Main",
        shortLabel: "Main",
        startPath: (id) => `/test/${id}`,
        historyPath: (id) => `/test/${id}/history`,
        attemptPath: (attemptId) => `/attempt/${attemptId}`,
        reportPath: (attemptId) => `/attempt/${attemptId}/report`,
        adminPaperPath: (id) => `/admin/paper/${id}`,
        adminCandidatePaperPath: (userId, id) => `/admin/candidate/${userId}/test/${id}`,
    },
    advancedLegacy: {
        variant: "advancedLegacy",
        family: "advanced",
        label: "JEE Advanced",
        shortLabel: "Advanced",
        startPath: (id) => `/test/${id}`,
        historyPath: (id) => `/test/${id}/history`,
        attemptPath: (attemptId) => `/advance/${attemptId}`,
        reportPath: (attemptId) => `/advance/${attemptId}/report`,
        adminPaperPath: (id) => `/admin/paper/${id}`,
        adminCandidatePaperPath: (userId, id) => `/admin/candidate/${userId}/test/${id}`,
    },
    advancedV2: {
        variant: "advancedV2",
        family: "advanced",
        label: "JEE Advanced",
        shortLabel: "Advanced",
        startPath: (id) => `/advance/test/${id}`,
        historyPath: (id) => `/advance/test/${id}/history`,
        attemptPath: (attemptId) => `/advance/${attemptId}`,
        reportPath: (attemptId) => `/advance/${attemptId}/report`,
        adminPaperPath: (id) => `/admin/paper/advance/${id}`,
        adminCandidatePaperPath: (userId, id) => `/admin/candidate/${userId}/advance/${id}`,
    },
};

export function getAssessmentVariantMeta(variant: AssessmentVariant): AssessmentVariantMeta {
    return ASSESSMENT_META[variant];
}

export function getTestSeriesVariant(isAdvancedFormat: boolean): AssessmentVariant {
    return isAdvancedFormat ? "advancedLegacy" : "main";
}

export function getAssessmentFamily(variant: AssessmentVariant): AssessmentFamily {
    return getAssessmentVariantMeta(variant).family;
}

export function getAssessmentLabel(variant: AssessmentVariant): string {
    return getAssessmentVariantMeta(variant).label;
}

export function getAssessmentShortLabel(variant: AssessmentVariant): string {
    return getAssessmentVariantMeta(variant).shortLabel;
}

export function getAssessmentStartPath(variant: AssessmentVariant, id: string): string {
    return getAssessmentVariantMeta(variant).startPath(id);
}

export function getAssessmentHistoryPath(variant: AssessmentVariant, id: string): string {
    return getAssessmentVariantMeta(variant).historyPath(id);
}

export function getAssessmentAttemptPath(variant: AssessmentVariant, attemptId: string): string {
    return getAssessmentVariantMeta(variant).attemptPath(attemptId);
}

export function getAssessmentReportPath(variant: AssessmentVariant, attemptId: string): string {
    return getAssessmentVariantMeta(variant).reportPath(attemptId);
}

export function getAssessmentAdminPaperPath(variant: AssessmentVariant, id: string): string {
    return getAssessmentVariantMeta(variant).adminPaperPath(id);
}

export function getAssessmentAdminCandidatePaperPath(
    variant: AssessmentVariant,
    userId: string,
    id: string,
): string {
    return getAssessmentVariantMeta(variant).adminCandidatePaperPath(userId, id);
}

export function getAssessmentCreateAttemptApiPath(): string {
    return "/api/assessments/attempts";
}

export function getAssessmentCreateAttemptBody(
    variant: AssessmentVariant,
    assessmentId: string,
    options?: { clientOffsetMs?: number },
): Record<string, string | number> {
    const body: Record<string, string | number> = {
        variant,
        assessmentId,
    };

    if (variant === "advancedV2" && typeof options?.clientOffsetMs === "number") {
        body.clientOffsetMs = options.clientOffsetMs;
    }

    return body;
}

export function getAssessmentAdminDeleteAttemptPath(attemptId: string): string {
    return `/api/admin/assessments/attempts/${attemptId}`;
}
