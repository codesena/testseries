import "dotenv/config";
import { prisma } from "../src/server/db";

function normStem(s: string) {
    return s.replace(/\s+/g, " ").trim();
}

type QRow = {
    id: string;
    stemRich: string;
    payload: unknown;
    block: {
        section: {
            sectionCode: string;
            examSubject: {
                subject: string;
            };
        };
    };
};

async function loadExamQuestions(examCode: string): Promise<QRow[]> {
    const exam = await prisma.examV2.findFirst({
        where: { code: examCode },
        select: { id: true },
    });

    if (!exam) throw new Error(`Exam not found for code: ${examCode}`);

    return prisma.examV2Question.findMany({
        where: {
            block: {
                section: {
                    examSubject: {
                        examId: exam.id,
                    },
                },
            },
        },
        select: {
            id: true,
            stemRich: true,
            payload: true,
            block: {
                select: {
                    section: {
                        select: {
                            sectionCode: true,
                            examSubject: {
                                select: {
                                    subject: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });
}

function keyOf(row: QRow) {
    return `${row.block.section.examSubject.subject}::${row.block.section.sectionCode}::${normStem(row.stemRich)}`;
}

async function main() {
    const sourceCode = process.argv[2] ?? "senatenikhil";
    const targetCode = process.argv[3] ?? "senatenikhil-1";

    const source = await loadExamQuestions(sourceCode);
    const target = await loadExamQuestions(targetCode);

    const sourceTopicByKey = new Map<string, string>();
    for (const row of source) {
        const payload = row.payload as Record<string, unknown> | null;
        const topic = typeof payload?.topicName === "string"
            ? payload.topicName.trim()
            : (typeof payload?.topic === "string" ? payload.topic.trim() : "");
        if (!topic) continue;
        sourceTopicByKey.set(keyOf(row), topic);
    }

    let matched = 0;
    let updated = 0;

    for (const row of target) {
        const topic = sourceTopicByKey.get(keyOf(row));
        if (!topic) continue;
        matched += 1;

        const payload = (row.payload && typeof row.payload === "object" && !Array.isArray(row.payload))
            ? (row.payload as Record<string, unknown>)
            : {};

        const hasTopic = typeof payload.topicName === "string" && payload.topicName.trim().length > 0;
        if (hasTopic) continue;

        await prisma.examV2Question.update({
            where: { id: row.id },
            data: {
                payload: {
                    ...payload,
                    topicName: topic,
                },
            },
        });

        updated += 1;
    }

    console.log(JSON.stringify({
        sourceCode,
        targetCode,
        sourceQuestions: source.length,
        targetQuestions: target.length,
        sourceTopics: sourceTopicByKey.size,
        matched,
        updated,
    }, null, 2));
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
