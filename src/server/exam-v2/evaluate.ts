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
    isAllCorrect: boolean;
};

function normalizeString(value: unknown): string {
    return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function normalizeSet(value: unknown): Set<string> {
    if (Array.isArray(value)) {
        return new Set(value.map((v) => normalizeString(v)).filter(Boolean));
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
        isAllCorrect,
    };
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

    if (ctx.isUnattempted) return scheme.unattemptedScore;

    const orderedRules = [...scheme.rules].sort((a, b) => a.priority - b.priority);
    for (const rule of orderedRules) {
        if (matchesRule(ctx, rule)) {
            return rule.score;
        }
    }

    return scheme.unattemptedScore;
}
