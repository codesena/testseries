type RuleKind = "FULL" | "PARTIAL" | "NEGATIVE" | "ZERO";

type QuestionType =
    | "SINGLE_CORRECT"
    | "MULTI_CORRECT"
    | "MATCHING_LIST"
    | "NAT_INTEGER"
    | "NAT_DECIMAL";

export type DynamicMarkingRule = {
    ruleKind: RuleKind;
    priority: number;
    score: number;
    minCorrectSelected?: number | null;
    maxCorrectSelected?: number | null;
    minIncorrectSelected?: number | null;
    maxIncorrectSelected?: number | null;
    requireAllCorrect?: boolean;
    requireZeroIncorrect?: boolean;
    requireUnattempted?: boolean;
};

export type DynamicMarkingScheme = {
    name?: string;
    questionType: QuestionType;
    unattemptedScore: number;
    rules: DynamicMarkingRule[];
};

export type EvaluationInput = {
    questionType: QuestionType;
    userAnswer: unknown;
    correctAnswer: unknown;
    scheme: DynamicMarkingScheme;
};

type EvalContext = {
    isUnattempted: boolean;
    selectedCount: number;
    correctSelectedCount: number;
    incorrectSelectedCount: number;
    totalCorrectCount: number;
    isAllCorrect: boolean;
};

function normalizeString(value: unknown): string {
    return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function splitAnswerTokens(raw: string): string[] {
    return raw
        .split(/[;,|]/g)
        .flatMap((part) => part.split(/\s+/g))
        .map((s) => normalizeString(s))
        .filter(Boolean);
}

function normalizeSet(value: unknown): Set<string> {
    if (Array.isArray(value)) {
        const tokens = value.flatMap((v) => {
            if (typeof v === "string") return splitAnswerTokens(v);
            const single = normalizeString(v);
            return single ? [single] : [];
        });
        return new Set(tokens);
    }
    if (typeof value === "string") {
        return new Set(splitAnswerTokens(value));
    }
    const asSingle = normalizeString(value);
    return asSingle ? new Set([asSingle]) : new Set();
}

function isUnattempted(questionType: QuestionType, userAnswer: unknown): boolean {
    if (userAnswer == null) return true;

    if (questionType === "NAT_INTEGER" || questionType === "NAT_DECIMAL") {
        if (typeof userAnswer === "string") return userAnswer.trim() === "";
        return Number.isNaN(Number(userAnswer));
    }

    if (Array.isArray(userAnswer)) return userAnswer.length === 0;
    if (typeof userAnswer === "string") return userAnswer.trim() === "";

    return false;
}

function buildContext(input: EvaluationInput): EvalContext {
    const { questionType, userAnswer, correctAnswer } = input;
    const unattempted = isUnattempted(questionType, userAnswer);

    if (unattempted) {
        return {
            isUnattempted: true,
            selectedCount: 0,
            correctSelectedCount: 0,
            incorrectSelectedCount: 0,
            totalCorrectCount: 0,
            isAllCorrect: false,
        };
    }

    if (questionType === "NAT_INTEGER" || questionType === "NAT_DECIMAL") {
        const user = Number(userAnswer);
        const correct = Number(correctAnswer);
        const isAllCorrect = Number.isFinite(user) && Number.isFinite(correct) && user === correct;
        return {
            isUnattempted: false,
            selectedCount: 1,
            correctSelectedCount: isAllCorrect ? 1 : 0,
            incorrectSelectedCount: isAllCorrect ? 0 : 1,
            totalCorrectCount: 1,
            isAllCorrect,
        };
    }

    if (questionType === "MULTI_CORRECT") {
        const user = normalizeSet(userAnswer);
        const correct = normalizeSet(correctAnswer);

        let correctSelectedCount = 0;
        let incorrectSelectedCount = 0;
        for (const opt of user) {
            if (correct.has(opt)) correctSelectedCount += 1;
            else incorrectSelectedCount += 1;
        }

        const isAllCorrect =
            incorrectSelectedCount === 0 &&
            user.size === correct.size &&
            correctSelectedCount === correct.size;

        return {
            isUnattempted: false,
            selectedCount: user.size,
            correctSelectedCount,
            incorrectSelectedCount,
            totalCorrectCount: correct.size,
            isAllCorrect,
        };
    }

    const user = normalizeString(userAnswer);
    const correct = normalizeString(correctAnswer);
    const isAllCorrect = user !== "" && user === correct;

    return {
        isUnattempted: false,
        selectedCount: user ? 1 : 0,
        correctSelectedCount: isAllCorrect ? 1 : 0,
        incorrectSelectedCount: isAllCorrect ? 0 : 1,
        totalCorrectCount: 1,
        isAllCorrect,
    };
}

function evaluateAdvancedMultiPartial(ctx: EvalContext, unattemptedScore: number): number {
    if (ctx.isUnattempted) return unattemptedScore;
    if (ctx.incorrectSelectedCount > 0) return -2;
    if (ctx.isAllCorrect) return 4;

    if (ctx.totalCorrectCount === 4 && ctx.correctSelectedCount === 3 && ctx.selectedCount === 3) {
        return 3;
    }

    if (ctx.totalCorrectCount >= 3 && ctx.correctSelectedCount === 2 && ctx.selectedCount === 2) {
        return 2;
    }

    if (ctx.totalCorrectCount >= 2 && ctx.correctSelectedCount === 1 && ctx.selectedCount === 1) {
        return 1;
    }

    return -2;
}

function matchesRule(ctx: EvalContext, rule: DynamicMarkingRule): boolean {
    if (rule.requireUnattempted && !ctx.isUnattempted) return false;
    if (rule.requireAllCorrect && !ctx.isAllCorrect) return false;
    if (rule.requireZeroIncorrect && ctx.incorrectSelectedCount !== 0) return false;

    if (rule.minCorrectSelected != null && ctx.correctSelectedCount < rule.minCorrectSelected) return false;
    if (rule.maxCorrectSelected != null && ctx.correctSelectedCount > rule.maxCorrectSelected) return false;
    if (rule.minIncorrectSelected != null && ctx.incorrectSelectedCount < rule.minIncorrectSelected) return false;
    if (rule.maxIncorrectSelected != null && ctx.incorrectSelectedCount > rule.maxIncorrectSelected) return false;

    return true;
}

export function evaluateWithDynamicScheme(input: EvaluationInput): number {
    const { scheme } = input;
    const ctx = buildContext(input);

    if (scheme.name === "V2_ADV_MULTI_PARTIAL" || scheme.name === "V2_ADV_MULTI_4_3_2_1_N2") {
        return evaluateAdvancedMultiPartial(ctx, scheme.unattemptedScore);
    }

    if (ctx.isUnattempted) return scheme.unattemptedScore;

    const orderedRules = [...scheme.rules].sort((a, b) => a.priority - b.priority);
    for (const rule of orderedRules) {
        if (matchesRule(ctx, rule)) {
            return rule.score;
        }
    }

    return scheme.unattemptedScore;
}
