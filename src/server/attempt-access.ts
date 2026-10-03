export function isFinalAttemptStatus(status: string): boolean {
    return status === "SUBMITTED" || status === "AUTO_SUBMITTED";
}
