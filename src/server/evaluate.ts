import { MarkingSchemeType, Prisma } from "@prisma/client";

type Json = Prisma.JsonValue;

function asStringSet(value: Json | undefined | null): Set<string> {
    if (Array.isArray(value)) return new Set(value.map(String));
    if (typeof value === "string") return new Set([value]);
    return new Set();
}

export function evaluateResponse(params: {
    userAnswer: Json | null;
    correctAnswer: Json;
    schemeType: MarkingSchemeType;
}): number {
    const { userAnswer, correctAnswer, schemeType } = params;

    if (userAnswer == null) return 0;

    if (schemeType === "MAINS_SINGLE") {
        return userAnswer === correctAnswer ? 4 : -1;
    }

    if (schemeType === "MAINS_NUMERICAL" || schemeType === "ADV_NAT") {
        const user = Number(userAnswer);
        const correct = Number(correctAnswer);
        if (Number.isNaN(user) || Number.isNaN(correct)) return 0;
        return user === correct ? 4 : -1;
    }

    if (schemeType === "ADV_MULTI_CORRECT") {
        const user = asStringSet(userAnswer);
        const correct = asStringSet(correctAnswer);

        if (user.size === 0) return 0;

        let hasWrong = false;
        for (const opt of user) {
            if (!correct.has(opt)) {
                hasWrong = true;
                break;
            }
        }
        if (hasWrong) return -2;

        if (user.size === correct.size) return 4;
        return user.size; // +1 per correct choice (subset-only)
    }

    return 0;
}
