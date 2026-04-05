import { getAuthUser } from "@/server/auth";
import { isAdminUsername } from "@/server/admin";
import { json } from "@/server/json";
import { Prisma } from "@prisma/client";
import { z } from "zod";

const QuestionTypeSchema = z.enum([
    "SINGLE_CORRECT",
    "MULTI_CORRECT",
    "MATCHING_LIST",
    "NAT_INTEGER",
    "NAT_DECIMAL",
]);

const OptionSchema = z.object({
    optionKey: z.string().trim().min(1).max(16),
    labelRich: z.string().trim().min(1),
    assets: z.unknown().optional(),
    isCorrect: z.boolean().optional(),
});

const MatchItemSchema = z.object({
    listName: z.string().trim().min(1).max(64),
    itemKey: z.string().trim().min(1).max(32),
    labelRich: z.string().trim().min(1),
});

const QuestionSchema = z.object({
    questionType: QuestionTypeSchema,
    stemRich: z.string().trim().min(1),
    stemAssets: z.unknown().optional(),
    payload: z.unknown().optional(),
    difficultyRank: z.number().int().nullable().optional(),
    markingSchemeName: z.string().trim().min(1).optional(),
    options: z.array(OptionSchema).optional(),
    matchItems: z.array(MatchItemSchema).optional(),
});

const BlockSchema = z.object({
    blockType: z.enum(["QUESTION", "PARAGRAPH"]),
    paragraphRich: z.string().optional(),
    paragraphAssets: z.unknown().optional(),
    questions: z.array(QuestionSchema).default([]),
});

const SectionSchema = z.object({
    sectionCode: z.string().trim().min(1).max(32),
    title: z.string().trim().min(1).max(256),
    instructionsRich: z.string().optional(),
    config: z.unknown().optional(),
    blocks: z.array(BlockSchema).min(1),
});

const SubjectSchema = z.object({
    subject: z.enum(["PHYSICS", "CHEMISTRY", "MATHEMATICS"]),
    sections: z.array(SectionSchema).min(1),
});

export const ExamV2UpsertSchema = z.object({
    code: z
        .string()
        .trim()
        .min(3)
        .max(64)
        .regex(/^[A-Za-z0-9_-]+$/),
    title: z.string().trim().min(3).max(256),
    durationMinutes: z.number().int().min(1).max(720),
    instructionsRichText: z.string().optional(),
    isActive: z.boolean().optional(),
    subjects: z.array(SubjectSchema).min(1),
});

export type ExamV2UpsertInput = z.infer<typeof ExamV2UpsertSchema>;

export async function ensureAdminGate() {
    const auth = await getAuthUser();
    if (!auth) return { ok: false as const, res: json({ error: "Unauthorized" }, { status: 401 }) };
    if (!isAdminUsername(auth.username)) {
        return { ok: false as const, res: json({ error: "Forbidden" }, { status: 403 }) };
    }
    return { ok: true as const, auth };
}

function collectMarkingSchemeNames(data: ExamV2UpsertInput): string[] {
    const names = new Set<string>();
    for (const subject of data.subjects) {
        for (const section of subject.sections) {
            for (const block of section.blocks) {
                for (const q of block.questions) {
                    if (q.markingSchemeName) names.add(q.markingSchemeName);
                }
            }
        }
    }
    return Array.from(names);
}

export async function upsertExamV2Graph(
    tx: Prisma.TransactionClient,
    data: ExamV2UpsertInput,
    existingExamId?: string,
) {
    const asNullableJson = (
        value: unknown,
    ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput =>
        value == null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);

    const schemeNames = collectMarkingSchemeNames(data);
    const schemes = schemeNames.length
        ? await tx.examV2MarkingScheme.findMany({
            where: { name: { in: schemeNames } },
            select: { id: true, name: true },
        })
        : [];
    const schemeByName = new Map(schemes.map((s) => [s.name, s.id] as const));

    for (const name of schemeNames) {
        if (!schemeByName.has(name)) {
            throw new Error(`Unknown marking scheme: ${name}`);
        }
    }

    const exam = existingExamId
        ? await tx.examV2.update({
            where: { id: existingExamId },
            data: {
                code: data.code,
                title: data.title,
                durationMinutes: data.durationMinutes,
                instructionsRichText: data.instructionsRichText ?? null,
                isActive: data.isActive ?? true,
            },
            select: { id: true },
        })
        : await tx.examV2.create({
            data: {
                code: data.code,
                title: data.title,
                durationMinutes: data.durationMinutes,
                instructionsRichText: data.instructionsRichText ?? null,
                isActive: data.isActive ?? true,
            },
            select: { id: true },
        });

    if (existingExamId) {
        await tx.examV2Subject.deleteMany({ where: { examId: exam.id } });
    }

    let questionCount = 0;
    for (const [subjectIndex, subject] of data.subjects.entries()) {
        const createdSubject = await tx.examV2Subject.create({
            data: {
                examId: exam.id,
                subject: subject.subject,
                sortOrder: subjectIndex,
            },
            select: { id: true },
        });

        for (const [sectionIndex, section] of subject.sections.entries()) {
            const createdSection = await tx.examV2Section.create({
                data: {
                    examSubjectId: createdSubject.id,
                    sectionCode: section.sectionCode,
                    title: section.title,
                    instructionsRich: section.instructionsRich ?? null,
                    sortOrder: sectionIndex,
                    config: asNullableJson(section.config),
                },
                select: { id: true },
            });

            for (const [blockIndex, block] of section.blocks.entries()) {
                const createdBlock = await tx.examV2Block.create({
                    data: {
                        sectionId: createdSection.id,
                        blockType: block.blockType,
                        sortOrder: blockIndex,
                        paragraphRich: block.paragraphRich ?? null,
                        paragraphAssets: asNullableJson(block.paragraphAssets),
                    },
                    select: { id: true },
                });

                for (const [questionIndex, question] of block.questions.entries()) {
                    const createdQuestion = await tx.examV2Question.create({
                        data: {
                            blockId: createdBlock.id,
                            questionType: question.questionType,
                            stemRich: question.stemRich,
                            stemAssets: asNullableJson(question.stemAssets),
                            payload: asNullableJson(question.payload),
                            difficultyRank: question.difficultyRank ?? null,
                            marksSchemeId: question.markingSchemeName
                                ? schemeByName.get(question.markingSchemeName) ?? null
                                : null,
                        },
                        select: { id: true },
                    });

                    if (question.options?.length) {
                        await tx.examV2QuestionOption.createMany({
                            data: question.options.map((opt, optionIndex) => ({
                                questionId: createdQuestion.id,
                                optionKey: opt.optionKey,
                                labelRich: opt.labelRich,
                                assets: asNullableJson(opt.assets),
                                sortOrder: optionIndex,
                                isCorrect: opt.isCorrect ?? null,
                            })),
                        });
                    }

                    if (question.matchItems?.length) {
                        await tx.examV2QuestionMatchItem.createMany({
                            data: question.matchItems.map((item, itemIndex) => ({
                                questionId: createdQuestion.id,
                                listName: item.listName,
                                itemKey: item.itemKey,
                                labelRich: item.labelRich,
                                sortOrder: itemIndex,
                            })),
                        });
                    }

                    questionCount += 1;
                    void questionIndex;
                }
            }
        }
    }

    return { examId: exam.id, questionCount };
}
