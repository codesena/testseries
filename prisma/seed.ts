import "dotenv/config";
import { prisma } from "../src/server/db";

async function main() {
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

    const existing = await prisma.testSeries.findFirst({
        where: { title: "Sample JEE Main Mock (Mini)" },
        select: { id: true },
    });

    if (existing) return;

    const questionData = [
        {
            subjectId: 1,
            topicName: "Kinematics",
            questionText:
                "A particle moves with constant acceleration $a=2\\,\\mathrm{m/s^2}$ starting from rest. What is its velocity after $t=3\\,\\mathrm{s}$?",
            options: {
                A: "$3\\,\\mathrm{m/s}$",
                B: "$6\\,\\mathrm{m/s}$",
                C: "$9\\,\\mathrm{m/s}$",
                D: "$12\\,\\mathrm{m/s}$",
            },
            correctAnswer: "B",
            markingSchemeType: "MAINS_SINGLE" as const,
            difficultyRank: 1,
        },
        {
            subjectId: 2,
            topicName: "Mole Concept",
            questionText:
                "Number of moles in $11\\,\\mathrm{g}$ of $\\mathrm{CO_2}$ is:",
            options: {
                A: "$0.1$",
                B: "$0.2$",
                C: "$0.25$",
                D: "$0.5$",
            },
            correctAnswer: "B",
            markingSchemeType: "MAINS_SINGLE" as const,
            difficultyRank: 2,
        },
        {
            subjectId: 3,
            topicName: "Integrals",
            questionText: "Evaluate $\\int_0^1 2x\\,dx$.",
            options: {
                A: "$0$",
                B: "$1$",
                C: "$2$",
                D: "$\\frac{1}{2}$",
            },
            correctAnswer: "B",
            markingSchemeType: "MAINS_SINGLE" as const,
            difficultyRank: 1,
        },
        {
            subjectId: 1,
            topicName: "Units",
            questionText:
                "A quantity has dimensions $[M^1 L^2 T^{-2}]$. Which of the following matches?",
            options: {
                A: "Force",
                B: "Energy",
                C: "Pressure",
                D: "Power",
            },
            correctAnswer: "B",
            markingSchemeType: "MAINS_SINGLE" as const,
            difficultyRank: 2,
        },
        {
            subjectId: 3,
            topicName: "JEE Advanced Multi-correct",
            questionText:
                "Select all correct statements about the set $S=\\{1,2,3\\}$.",
            options: {
                A: "$|S|=3$",
                B: "$0 \\in S$",
                C: "$2 \\in S$",
                D: "$S$ is empty",
            },
            correctAnswer: ["A", "C"],
            markingSchemeType: "ADV_MULTI_CORRECT" as const,
            difficultyRank: 1,
        },
    ];

    const questions = [] as Array<{ id: string }>;
    for (const data of questionData) {
        const created = await prisma.question.create({
            data,
            select: { id: true },
        });
        questions.push(created);
    }

    const test = await prisma.testSeries.create({
        data: {
            title: "Sample JEE Main Mock (Mini)",
            totalDurationMinutes: 30,
            isAdvancedFormat: false,
            questions: {
                create: questions.map((q, idx) => ({
                    questionId: q.id,
                    orderIndex: idx,
                })),
            },
        },
        select: { id: true },
    });

    console.log(`Seeded test ${test.id} with ${questions.length} questions.`);
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
