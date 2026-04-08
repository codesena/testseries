import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { InstructionRichText } from "@/components/common/InstructionRichText";
import {
    SlimPageHeader,
    getSlimHeaderPillStyle,
    slimHeaderPillClassName,
} from "@/components/common/SlimPageHeader";
import { StartV2AttemptButton } from "@/components/StartV2AttemptButton";
import {
    getAssessmentHistoryPath,
    getAssessmentLabel,
} from "@/lib/assessment";
import { splitInstructionSections } from "@/lib/instructions";
import { getAuthUserId } from "@/server/auth";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

function formatSubject(subject: "PHYSICS" | "CHEMISTRY" | "MATHEMATICS") {
    if (subject === "PHYSICS") return "Physics";
    if (subject === "CHEMISTRY") return "Chemistry";
    return "Mathematics";
}

function formatQuestionType(type: "SINGLE_CORRECT" | "MULTI_CORRECT" | "MATCHING_LIST" | "NAT_INTEGER" | "NAT_DECIMAL") {
    if (type === "SINGLE_CORRECT") return "Single Correct";
    if (type === "MULTI_CORRECT") return "Multi Correct";
    if (type === "MATCHING_LIST") return "Matching List";
    if (type === "NAT_INTEGER") return "NAT Integer";
    return "NAT Decimal";
}

function instructionForType(type: "SINGLE_CORRECT" | "MULTI_CORRECT" | "MATCHING_LIST" | "NAT_INTEGER" | "NAT_DECIMAL") {
    if (type === "SINGLE_CORRECT") {
        return "Each question has four options. Only one option is correct.";
    }
    if (type === "MULTI_CORRECT") {
        return "Each question has four options. One or more than one option can be correct.";
    }
    if (type === "MATCHING_LIST") {
        return "Matching-list type: choose the correct coded option for the given List-I and List-II entries.";
    }
    if (type === "NAT_INTEGER") {
        return "Numerical answer type: enter a non-negative integer value.";
    }
    return "Numerical answer type: enter the decimal value as instructed.";
}

function sectionTypeHeading(type: "SINGLE_CORRECT" | "MULTI_CORRECT" | "MATCHING_LIST" | "NAT_INTEGER" | "NAT_DECIMAL" | undefined) {
    if (type === "SINGLE_CORRECT") return "One Option Correct Type";
    if (type === "MULTI_CORRECT") return "One or More than One Correct Type";
    if (type === "MATCHING_LIST") return "Matching List Type";
    if (type === "NAT_INTEGER" || type === "NAT_DECIMAL") return "Numerical Answer Type";
    return "Mixed Type";
}

function sectionLetterFromIndex(index: number) {
    // Excel-like sequence: A..Z, AA..AZ, BA...
    let n = index;
    let out = "";
    do {
        out = String.fromCharCode(65 + (n % 26)) + out;
        n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return out;
}

function fmtRange(start: number, end: number) {
    return start === end ? String(start).padStart(2, "0") : `${String(start).padStart(2, "0")} - ${String(end).padStart(2, "0")}`;
}

export default async function AdvancedTestStartPage({
    params,
}: {
    params: Promise<{ examId: string }>;
}) {
    const userId = await getAuthUserId();
    if (!userId) redirect("/login");

    const { examId } = await params;

    const exam = await prisma.examV2.findFirst({
        where: { id: examId, isActive: true },
        select: {
            id: true,
            code: true,
            title: true,
            durationMinutes: true,
            instructionsRichText: true,
            subjects: {
                orderBy: { sortOrder: "asc" },
                select: {
                    subject: true,
                    sortOrder: true,
                    sections: {
                        orderBy: { sortOrder: "asc" },
                        select: {
                            id: true,
                            sectionCode: true,
                            title: true,
                            instructionsRich: true,
                            blocks: {
                                select: {
                                    questions: {
                                        select: {
                                            id: true,
                                            questionType: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!exam) return notFound();

    const subjectStats = exam.subjects.map((subject) => {
        const sectionStats = subject.sections.map((section) => {
            const questionCount = section.blocks.reduce((acc, block) => acc + block.questions.length, 0);
            const questionTypes = section.blocks.flatMap((block) => block.questions.map((q) => q.questionType));
            const typeCounts = questionTypes.reduce((acc, type) => {
                acc[type] = (acc[type] ?? 0) + 1;
                return acc;
            }, {} as Record<string, number>);
            const dominantType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as
                | "SINGLE_CORRECT"
                | "MULTI_CORRECT"
                | "MATCHING_LIST"
                | "NAT_INTEGER"
                | "NAT_DECIMAL"
                | undefined;

            return {
                id: section.id,
                code: section.sectionCode,
                title: section.title,
                instructionsRich: section.instructionsRich,
                questionCount,
                dominantType,
            };
        });

        return {
            subject: formatSubject(subject.subject),
            sectionCount: sectionStats.length,
            questionCount: sectionStats.reduce((acc, sec) => acc + sec.questionCount, 0),
            sections: sectionStats,
        };
    });

    const totalSections = subjectStats.reduce((acc, subject) => acc + subject.sectionCount, 0);
    const totalQuestions = subjectStats.reduce((acc, subject) => acc + subject.questionCount, 0);

    const sectionRangesBySubject = subjectStats.map((subject) => {
        let cursor = 1;
        return {
            subject: subject.subject,
            sections: subject.sections.map((section) => {
                const start = cursor;
                const end = cursor + section.questionCount - 1;
                cursor = end + 1;
                return {
                    ...section,
                    start,
                    end,
                };
            }),
        };
    });

    const sectionRangesGlobal = sectionRangesBySubject.reduce<{
        offset: number;
        subjects: Array<{
            subject: string;
            sections: Array<(typeof sectionRangesBySubject)[number]["sections"][number] & {
                globalStart: number;
                globalEnd: number;
            }>;
        }>;
    }>((acc, subject) => {
        const nextSections = subject.sections.map((section) => ({
            ...section,
            globalStart: section.start + acc.offset,
            globalEnd: section.end + acc.offset,
        }));
        const nextOffset =
            acc.offset + subject.sections.reduce((count, section) => count + section.questionCount, 0);

        return {
            offset: nextOffset,
            subjects: [
                ...acc.subjects,
                {
                    subject: subject.subject,
                    sections: nextSections,
                },
            ],
        };
    }, { offset: 0, subjects: [] }).subjects;

    const maxSectionSlots = Math.max(0, ...sectionRangesGlobal.map((subject) => subject.sections.length));
    const groupedSectionInstructions = Array.from({ length: maxSectionSlots }).map((_, slotIndex) => {
        const matches = sectionRangesGlobal
            .map((subject) => subject.sections[slotIndex])
            .filter((item): item is NonNullable<typeof item> => Boolean(item));

        const ranges = matches.map((m) => fmtRange(m.globalStart, m.globalEnd)).join(", ");
        const questionCount = matches.reduce((acc, m) => acc + m.questionCount, 0);
        const type = matches[0]?.dominantType;

        return {
            slotIndex,
            ranges,
            questionCount,
            sectionLabel: `SECTION - ${sectionLetterFromIndex(slotIndex)}`,
            type,
        };
    });

    const customInstructionSections = splitInstructionSections(exam.instructionsRichText);
    const hasCustomInstructions = Boolean(
        customInstructionSections.generalInstructions.trim() || customInstructionSections.markingScheme.trim(),
    );

    return (
        <div className="min-h-screen flex flex-col">
            <SlimPageHeader
                badgeLabel="A"
                title="JEE Advanced"
                subtitle="Review subject-wise pattern and instructions, then start."
                actions={
                    <>
                        <Link
                            href="/"
                            className={slimHeaderPillClassName}
                            style={getSlimHeaderPillStyle()}
                        >
                            Home
                        </Link>
                        <Link
                            href={getAssessmentHistoryPath("advancedV2", exam.id)}
                            className={slimHeaderPillClassName}
                            style={getSlimHeaderPillStyle()}
                        >
                            History
                        </Link>
                    </>
                }
            />

            <main className="max-w-5xl mx-auto w-full px-4 pt-8 pb-16">
                <section className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                    <h1 className="text-2xl font-semibold leading-snug">{exam.title}</h1>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                        <span
                            className="inline-flex items-center justify-center h-7 rounded-full border px-2.5 whitespace-nowrap"
                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        >
                            {getAssessmentLabel("advancedV2")}
                        </span>
                        <span className="opacity-60">{exam.code}</span>
                        <span className="opacity-60">{subjectStats.length} subjects</span>
                        <span className="opacity-60">{totalSections} sections</span>
                        <span className="opacity-60">{totalQuestions} questions</span>
                        <span className="opacity-60">{exam.durationMinutes} minutes</span>
                    </div>

                    <div
                        className="mt-6 rounded-2xl border p-4"
                        style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--muted) 55%, transparent)" }}
                    >
                        {hasCustomInstructions ? (
                            <>
                                <div className="font-medium">General Instructions & Marking Scheme</div>
                                <div className="mt-2 space-y-3">
                                    {customInstructionSections.generalInstructions.trim() ? (
                                        <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                                            <div className="text-sm font-medium">General Instructions</div>
                                            <InstructionRichText
                                                text={customInstructionSections.generalInstructions}
                                                className="mt-2 text-sm opacity-90"
                                            />
                                        </div>
                                    ) : null}

                                    {customInstructionSections.markingScheme.trim() ? (
                                        <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                                            <div className="text-sm font-medium">Marking Scheme</div>
                                            <InstructionRichText
                                                text={customInstructionSections.markingScheme}
                                                className="mt-2 text-sm opacity-90"
                                            />
                                        </div>
                                    ) : null}
                                </div>

                                <div className="mt-5 font-medium">Paper Structure Snapshot</div>
                                <div className="mt-2 text-sm opacity-85 list-disc pl-5 space-y-1">
                                    <li>The test consists of total {totalQuestions} questions.</li>
                                    <li>Each subject (PCM) has {subjectStats[0]?.questionCount ?? 0} questions.</li>
                                    <li>This question paper contains three parts: Physics, Chemistry and Mathematics.</li>
                                    <li>Each part is further divided into {Math.max(0, ...subjectStats.map((s) => s.sectionCount))} section(s).</li>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="font-medium">General Instructions</div>
                                <ul className="mt-2 text-sm opacity-85 list-disc pl-5 space-y-1">
                                    <li>The test consists of total {totalQuestions} questions.</li>
                                    <li>Each subject (PCM) has {subjectStats[0]?.questionCount ?? 0} questions.</li>
                                    <li>This question paper contains three parts: Physics, Chemistry and Mathematics.</li>
                                    <li>Each part is further divided into {Math.max(0, ...subjectStats.map((s) => s.sectionCount))} section(s).</li>
                                </ul>

                                <div className="mt-3 space-y-2 text-sm opacity-85">
                                    {groupedSectionInstructions.map((item) => (
                                        <div key={item.slotIndex} className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                                            <div className="font-medium">{item.sectionLabel}</div>
                                            <div className="opacity-80">({sectionTypeHeading(item.type)})</div>
                                            <div className="mt-1">
                                                Range {item.ranges}: {item.questionCount} question{item.questionCount === 1 ? "" : "s"}
                                                {item.type ? ` · ${formatQuestionType(item.type)}` : ""}
                                            </div>
                                            {item.type ? <div className="mt-1 opacity-75">{instructionForType(item.type)}</div> : null}
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-4 font-medium">Paper Notes</div>
                                <ul className="mt-2 text-sm opacity-80 list-disc pl-5 space-y-1">
                                    <li>Read each section instruction before answering.</li>
                                    <li>Use the question palette and subject tabs for navigation.</li>
                                    <li>Submit only after reviewing all marked/unattempted questions.</li>
                                </ul>
                            </>
                        )}
                    </div>

                    <div className="mt-6 flex flex-wrap items-center gap-3">
                        <StartV2AttemptButton examId={exam.id} />
                        <Link
                            href="/"
                            className="inline-flex items-center justify-center h-10 rounded-full border px-4 text-sm whitespace-nowrap ui-click"
                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                        >
                            Cancel
                        </Link>
                    </div>
                </section>
            </main>
        </div>
    );
}
