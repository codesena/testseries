export type PaletteStatus =
    | "NOT_VISITED"
    | "VISITED_NOT_ANSWERED"
    | "ANSWERED_SAVED"
    | "MARKED_FOR_REVIEW"
    | "ANSWERED_MARKED_FOR_REVIEW";

export function derivePaletteStatus(params: {
    existing: PaletteStatus;
    selectedAnswer: unknown;
    markedForReview: boolean;
}): PaletteStatus {
    const { existing, selectedAnswer, markedForReview } = params;

    const hasAnswer =
        selectedAnswer != null &&
        !(typeof selectedAnswer === "string" && selectedAnswer.trim() === "");

    if (markedForReview && hasAnswer) return "ANSWERED_MARKED_FOR_REVIEW";
    if (markedForReview) return "MARKED_FOR_REVIEW";
    if (hasAnswer) return "ANSWERED_SAVED";
    if (existing === "NOT_VISITED") return "VISITED_NOT_ANSWERED";
    return existing;
}
