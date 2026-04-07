import "dotenv/config";
import { prisma } from "../src/server/db";

type SeedRule = {
    ruleKind: "FULL" | "PARTIAL" | "NEGATIVE" | "ZERO";
    priority: number;
    score: number;
    minCorrectSelected?: number;
    maxCorrectSelected?: number;
    minIncorrectSelected?: number;
    maxIncorrectSelected?: number;
    requireAllCorrect?: boolean;
    requireZeroIncorrect?: boolean;
    requireUnattempted?: boolean;
};

type SeedScheme = {
    name: string;
    questionType:
    | "SINGLE_CORRECT"
    | "MULTI_CORRECT"
    | "MATCHING_LIST"
    | "NAT_INTEGER"
    | "NAT_DECIMAL";
    unattemptedScore: number;
    notes: string;
    rules: SeedRule[];
};

async function seedExamV2MarkingSchemes() {
    const schemes: SeedScheme[] = [
        {
            name: "V2_MAINS_SINGLE_4N1",
            questionType: "SINGLE_CORRECT" as const,
            unattemptedScore: 0,
            notes: "+4 correct, -1 incorrect, 0 unattempted",
            rules: [
                {
                    ruleKind: "FULL" as const,
                    priority: 1,
                    score: 4,
                    requireAllCorrect: true,
                    requireZeroIncorrect: true,
                },
                {
                    ruleKind: "NEGATIVE" as const,
                    priority: 2,
                    score: -1,
                    minIncorrectSelected: 1,
                },
                {
                    ruleKind: "ZERO" as const,
                    priority: 3,
                    score: 0,
                },
            ],
        },
        {
            name: "V2_ADV_MULTI_PARTIAL",
            questionType: "MULTI_CORRECT" as const,
            unattemptedScore: 0,
            notes: "Advanced multi-correct scheme (+4/+3/+2/+1/-2) handled by evaluator using scheme name",
            rules: [
                {
                    ruleKind: "FULL" as const,
                    priority: 1,
                    score: 4,
                    requireAllCorrect: true,
                    requireZeroIncorrect: true,
                },
                {
                    ruleKind: "PARTIAL" as const,
                    priority: 2,
                    score: 1,
                    minCorrectSelected: 1,
                    requireZeroIncorrect: true,
                },
                {
                    ruleKind: "NEGATIVE" as const,
                    priority: 3,
                    score: -2,
                    minIncorrectSelected: 1,
                },
                {
                    ruleKind: "ZERO" as const,
                    priority: 4,
                    score: 0,
                },
            ],
        },
        {
            name: "V2_ADV_MULTI_4_3_2_1_N2",
            questionType: "MULTI_CORRECT" as const,
            unattemptedScore: 0,
            notes: "Advanced multi-correct (+4/+3/+2/+1/-2) with conditional partials",
            rules: [
                {
                    ruleKind: "FULL" as const,
                    priority: 1,
                    score: 4,
                    requireAllCorrect: true,
                    requireZeroIncorrect: true,
                },
                {
                    ruleKind: "NEGATIVE" as const,
                    priority: 2,
                    score: -2,
                    minIncorrectSelected: 1,
                },
                {
                    ruleKind: "ZERO" as const,
                    priority: 3,
                    score: 0,
                },
            ],
        },
        {
            name: "V2_ADV_SINGLE_3N1",
            questionType: "SINGLE_CORRECT" as const,
            unattemptedScore: 0,
            notes: "+3 correct, -1 incorrect, 0 unattempted",
            rules: [
                {
                    ruleKind: "FULL" as const,
                    priority: 1,
                    score: 3,
                    requireAllCorrect: true,
                    requireZeroIncorrect: true,
                },
                {
                    ruleKind: "NEGATIVE" as const,
                    priority: 2,
                    score: -1,
                    minIncorrectSelected: 1,
                },
                {
                    ruleKind: "ZERO" as const,
                    priority: 3,
                    score: 0,
                },
            ],
        },
        {
            name: "V2_ADV_MATCH_3N1",
            questionType: "MATCHING_LIST" as const,
            unattemptedScore: 0,
            notes: "Legacy name kept for compatibility: +3 correct, 0 incorrect, 0 unattempted",
            rules: [
                {
                    ruleKind: "FULL" as const,
                    priority: 1,
                    score: 3,
                    requireAllCorrect: true,
                    requireZeroIncorrect: true,
                },
                {
                    ruleKind: "ZERO" as const,
                    priority: 2,
                    score: 0,
                },
            ],
        },
        {
            name: "V2_ADV_MATCH_3N0",
            questionType: "MATCHING_LIST" as const,
            unattemptedScore: 0,
            notes: "+3 correct, 0 incorrect, 0 unattempted",
            rules: [
                {
                    ruleKind: "FULL" as const,
                    priority: 1,
                    score: 3,
                    requireAllCorrect: true,
                    requireZeroIncorrect: true,
                },
                {
                    ruleKind: "ZERO" as const,
                    priority: 2,
                    score: 0,
                },
            ],
        },
        {
            name: "V2_ADV_NAT_INTEGER_4N0",
            questionType: "NAT_INTEGER" as const,
            unattemptedScore: 0,
            notes: "+4 exact match, 0 otherwise",
            rules: [
                {
                    ruleKind: "FULL" as const,
                    priority: 1,
                    score: 4,
                    requireAllCorrect: true,
                    requireZeroIncorrect: true,
                },
                {
                    ruleKind: "ZERO" as const,
                    priority: 2,
                    score: 0,
                },
            ],
        },
        {
            name: "V2_ADV_NAT_DECIMAL_3N0",
            questionType: "NAT_DECIMAL" as const,
            unattemptedScore: 0,
            notes: "+3 exact match, 0 otherwise",
            rules: [
                {
                    ruleKind: "FULL" as const,
                    priority: 1,
                    score: 3,
                    requireAllCorrect: true,
                    requireZeroIncorrect: true,
                },
                {
                    ruleKind: "ZERO" as const,
                    priority: 2,
                    score: 0,
                },
            ],
        },
        {
            name: "V2_NAT_STANDARD",
            questionType: "NAT_DECIMAL" as const,
            unattemptedScore: 0,
            notes: "+4 exact match, 0 otherwise",
            rules: [
                {
                    ruleKind: "FULL" as const,
                    priority: 1,
                    score: 4,
                    requireAllCorrect: true,
                    requireZeroIncorrect: true,
                },
                {
                    ruleKind: "ZERO" as const,
                    priority: 2,
                    score: 0,
                },
            ],
        },
    ];

    for (const scheme of schemes) {
        const upserted = await prisma.examV2MarkingScheme.upsert({
            where: { name: scheme.name },
            update: {
                questionType: scheme.questionType,
                unattemptedScore: scheme.unattemptedScore,
                notes: scheme.notes,
            },
            create: {
                name: scheme.name,
                questionType: scheme.questionType,
                unattemptedScore: scheme.unattemptedScore,
                notes: scheme.notes,
            },
            select: { id: true },
        });

        await prisma.examV2MarkingRule.deleteMany({
            where: { schemeId: upserted.id },
        });

        await prisma.examV2MarkingRule.createMany({
            data: scheme.rules.map((rule) => ({
                schemeId: upserted.id,
                ruleKind: rule.ruleKind,
                priority: rule.priority,
                score: rule.score,
                minCorrectSelected: rule.minCorrectSelected ?? null,
                maxCorrectSelected: rule.maxCorrectSelected ?? null,
                minIncorrectSelected: rule.minIncorrectSelected ?? null,
                maxIncorrectSelected: rule.maxIncorrectSelected ?? null,
                requireAllCorrect: rule.requireAllCorrect ?? false,
                requireZeroIncorrect: rule.requireZeroIncorrect ?? false,
                requireUnattempted: rule.requireUnattempted ?? false,
            })),
        });
    }
}

async function main() {
    await seedExamV2MarkingSchemes();

    await prisma.subjectCategory.upsert({
        where: { id: 1 },
        update: { name: "Physics" },
        create: { id: 1, name: "Physics" },
    });
    await prisma.subjectCategory.upsert({
        where: { id: 2 },
        update: { name: "Chemistry" },
        create: { id: 2, name: "Chemistry" },
    });
    await prisma.subjectCategory.upsert({
        where: { id: 3 },
        update: { name: "Mathematics" },
        create: { id: 3, name: "Mathematics" },
    });
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
