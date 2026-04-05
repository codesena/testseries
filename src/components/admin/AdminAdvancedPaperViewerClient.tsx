"use client";

import Link from "next/link";
import { MathJax, MathJaxContext } from "better-react-mathjax";
import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { InstructionRichText } from "@/components/common/InstructionRichText";
import { RichStemContent } from "@/components/common/RichStemContent";
import { optimizeImageDelivery } from "@/lib/image-delivery";
import { composeInstructionSections, splitInstructionSections } from "@/lib/instructions";

type QuestionType = "SINGLE_CORRECT" | "MULTI_CORRECT" | "MATCHING_LIST" | "NAT_INTEGER" | "NAT_DECIMAL";

type AdvancedPaperQuestion = {
    id: string;
    index: number;
    subjectName: string;
    sectionCode: string;
    sectionTitle: string;
    topicName: string | null;
    questionType: QuestionType;
    questionText: string;
    imageUrls: string[];
    options: Array<{ key: string; text: string; imageUrl: string | null }>;
    correctAnswer: unknown;
    markingSchemeName: string | null;
};

type EditPayload = {
    questionType: QuestionType;
    questionText: string;
    questionImageUrls: string[];
    markingSchemeName?: string;
    options: Array<{ optionKey: string; labelRich: string; imageUrls: string[] }>;
    correctAnswerText: string;
    availableMarkingSchemes?: string[];
};

type QuestionIssueItem = {
    id: string;
    source: "admin" | "student";
    createdAt: string;
    issue: string;
    details: string | null;
    attemptId: string | null;
    reporterName: string | null;
    reporterUsername: string | null;
};

type ParsedMatchingStem = {
    intro: string[];
    listI: string[];
    listII: string[];
    outro: string[];
};

const ADV_UPLOAD_PREFIX = "jeeadvanced/advance";
const DEFAULT_UPLOAD_FOLDER = "paper-x";

const mathjaxConfig = {
    loader: { load: ["[tex]/mhchem"] },
    tex: {
        packages: { "[+]": ["mhchem"] },
        inlineMath: [["$", "$"], ["\\(", "\\)"]],
        displayMath: [["$$", "$$"], ["\\[", "\\]"]],
    },
} as const;

function splitUrlList(raw: string): string[] {
    return raw
        .split(/\r?\n|,|;/g)
        .map((s) => s.trim())
        .filter(Boolean);
}

function asStringArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String).map((v) => v.trim()).filter(Boolean);
    if (typeof value === "string") return splitUrlList(value);
    return [];
}

function parseAssetsToUrls(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String).map((v) => v.trim()).filter(Boolean);
    if (typeof value === "string") return splitUrlList(value);
    if (value && typeof value === "object") {
        const obj = value as Record<string, unknown>;
        const candidates = [obj.imageUrls, obj.urls, obj.images, obj.url, obj.src];
        const out: string[] = [];
        for (const c of candidates) {
            if (typeof c === "string" && c.trim()) out.push(c.trim());
            if (Array.isArray(c)) {
                for (const i of c) {
                    const s = String(i).trim();
                    if (s) out.push(s);
                }
            }
        }
        return Array.from(new Set(out));
    }
    return [];
}

function formatAnswer(value: unknown): string {
    if (value == null) return "";
    if (Array.isArray(value)) return value.map(String).join(", ");
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function parseCorrectAnswerForUi(questionType: QuestionType, correctAnswerText: string): unknown {
    const raw = (correctAnswerText ?? "").trim();
    if (questionType === "MULTI_CORRECT") {
        return raw
            .split(/[\s,;|]+/g)
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean);
    }
    if (questionType === "SINGLE_CORRECT" || questionType === "MATCHING_LIST") {
        return raw.toUpperCase();
    }
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}

function isCorrectOption(question: AdvancedPaperQuestion, key: string): boolean {
    const ans = question.correctAnswer;
    if (question.questionType === "MULTI_CORRECT") {
        return Array.isArray(ans) ? ans.map(String).includes(key) : false;
    }
    return String(ans ?? "") === key;
}

function subjectTone(name: string) {
    const s = name.toLowerCase();
    if (s.includes("phys")) return "bg-sky-600/80 text-sky-50";
    if (s.includes("chem")) return "bg-emerald-600/80 text-emerald-50";
    return "bg-amber-500/85 text-amber-950";
}

function formatSectionLabel(sectionCode: string) {
    const raw = String(sectionCode || "").trim();
    if (!raw) return "Section";
    const suffix = raw.includes("-") ? raw.split("-").pop() ?? raw : raw;
    return `Section-${suffix.toUpperCase()}`;
}

function isListMarker(line: string, roman: "i" | "ii") {
    const cleaned = line.trim().replace(/[\u2013\u2014]/g, "-");
    if (roman === "i") return /^list\s*-?\s*i\s*:?.*$/i.test(cleaned);
    return /^list\s*-?\s*ii\s*:?.*$/i.test(cleaned);
}

function parseMatchingStem(stem: string): ParsedMatchingStem | null {
    const lines = stem
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    if (!lines.length) return null;

    const listIIndex = lines.findIndex((line) => isListMarker(line, "i"));
    const listIIIndex = lines.findIndex((line) => isListMarker(line, "ii"));

    if (listIIndex === -1 || listIIIndex === -1 || listIIIndex <= listIIndex) return null;

    const intro = lines.slice(0, listIIndex);
    const listI = lines.slice(listIIndex + 1, listIIIndex);
    const afterListII = lines.slice(listIIIndex + 1);

    const firstBreakAfterListII = afterListII.findIndex((line) => !/^\([A-Za-z0-9]+\)/.test(line));
    const listII = firstBreakAfterListII === -1 ? afterListII : afterListII.slice(0, firstBreakAfterListII);
    const outro = firstBreakAfterListII === -1 ? [] : afterListII.slice(firstBreakAfterListII);

    if (!listI.length || !listII.length) return null;

    return { intro, listI, listII, outro };
}

function normalizeMatchingLineForMathJax(line: string): string {
    const trimmed = line.trim();
    const hasExplicitMath = trimmed.includes("$") || trimmed.includes("\\(") || trimmed.includes("\\[");
    const hasLatexCommand = /\\[a-zA-Z]+/.test(trimmed);

    if (!hasLatexCommand || hasExplicitMath) return line;

    const markerMatch = trimmed.match(/^(\([A-Za-z0-9]+\))\s*(.*)$/);
    if (markerMatch) {
        const marker = markerMatch[1];
        const rest = markerMatch[2].trim();
        if (!rest) return marker;
        return `${marker} $${rest}$`;
    }

    return `$${trimmed}$`;
}

function slugifyFolderName(input: string): string {
    return input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-_\s]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80);
}

function buildPipeTableTemplate(rowCount: number, columnCount: number): string {
    const cols = Math.max(2, Math.min(8, Math.floor(columnCount)));
    const rows = Math.max(1, Math.min(20, Math.floor(rowCount)));

    const header = `| ${Array.from({ length: cols }, (_, i) => `Col ${i + 1}`).join(" | ")} |`;
    const sep = `| ${Array.from({ length: cols }, () => "---").join(" | ")} |`;
    const body = Array.from({ length: rows }, () => `| ${Array.from({ length: cols }, () => "").join(" | ")} |`).join("\n");

    return `${header}\n${sep}\n${body}`;
}

function parseTableRow(line: string): string[] | null {
    if (!line.includes("|")) return null;
    const raw = line.trim();
    if (!raw) return null;
    const trimmed = raw.replace(/^\|/, "").replace(/\|$/, "");
    const cells = trimmed.split("|").map((c) => c.trim());
    return cells.length ? cells : null;
}

function isTableSeparatorRow(cells: string[]): boolean {
    return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}

type FirstPipeTable = {
    startLine: number;
    endLineExclusive: number;
};

function findFirstPipeTable(lines: string[]): FirstPipeTable | null {
    for (let i = 0; i < lines.length - 1; i += 1) {
        const head = parseTableRow(lines[i]);
        const sep = parseTableRow(lines[i + 1]);
        if (!head || !sep) continue;
        if (head.length !== sep.length || !isTableSeparatorRow(sep)) continue;

        let j = i + 2;
        while (j < lines.length) {
            const row = parseTableRow(lines[j]);
            if (!row) break;
            j += 1;
        }

        return {
            startLine: i,
            endLineExclusive: j,
        };
    }

    return null;
}

function replaceFirstPipeTableBlock(questionText: string, newTable: string): string {
    const lines = questionText.split(/\r?\n/);
    const found = findFirstPipeTable(lines);
    const nextTableLines = newTable.split(/\r?\n/);

    if (!found) {
        return questionText.trim() ? `${questionText.trim()}\n\n${newTable}` : newTable;
    }

    const out = [
        ...lines.slice(0, found.startLine),
        ...nextTableLines,
        ...lines.slice(found.endLineExclusive),
    ];

    return out.join("\n");
}

function toEditPayload(q: AdvancedPaperQuestion): EditPayload {
    return {
        questionType: q.questionType,
        questionText: q.questionText,
        questionImageUrls: q.imageUrls,
        options: q.options.map((o) => ({
            optionKey: o.key,
            labelRich: o.text,
            imageUrls: o.imageUrl ? splitUrlList(o.imageUrl) : [],
        })),
        markingSchemeName: q.markingSchemeName ?? "",
        correctAnswerText: formatAnswer(q.correctAnswer),
    };
}

function coerceEditPayload(value: unknown): EditPayload | null {
    if (!value || typeof value !== "object") return null;
    const obj = value as Record<string, unknown>;
    const questionType = String(obj.questionType ?? "") as QuestionType;
    if (!["SINGLE_CORRECT", "MULTI_CORRECT", "MATCHING_LIST", "NAT_INTEGER", "NAT_DECIMAL"].includes(questionType)) {
        return null;
    }

    const optionsRaw = Array.isArray(obj.options) ? obj.options : [];
    const options = optionsRaw
        .map((item) => {
            if (!item || typeof item !== "object") return null;
            const row = item as Record<string, unknown>;
            const optionKey = String(row.optionKey ?? "").trim();
            if (!optionKey) return null;
            return {
                optionKey,
                labelRich: String(row.labelRich ?? ""),
                imageUrls: asStringArray(row.imageUrls),
            };
        })
        .filter((item): item is { optionKey: string; labelRich: string; imageUrls: string[] } => Boolean(item));

    return {
        questionType,
        questionText: String(obj.questionText ?? ""),
        questionImageUrls: asStringArray(obj.questionImageUrls),
        markingSchemeName: String(obj.markingSchemeName ?? "").trim(),
        options,
        correctAnswerText: String(obj.correctAnswerText ?? ""),
        availableMarkingSchemes: Array.isArray(obj.availableMarkingSchemes)
            ? obj.availableMarkingSchemes.map(String).map((s) => s.trim()).filter(Boolean)
            : undefined,
    };
}

export function AdminAdvancedPaperViewerClient({
    examId,
    examTitle,
    examCode,
    durationMinutes,
    examInstructions,
    questions,
}: {
    examId: string;
    examTitle: string;
    examCode: string;
    durationMinutes: number;
    examInstructions: string | null;
    questions: AdvancedPaperQuestion[];
}) {
    const initialInstructionSections = splitInstructionSections(examInstructions);
    const [viewerQuestions, setViewerQuestions] = useState<AdvancedPaperQuestion[]>(questions);
    const [paperTitle, setPaperTitle] = useState(examTitle);
    const [savingPaperTitle, setSavingPaperTitle] = useState(false);
    const [paperTitleError, setPaperTitleError] = useState<string | null>(null);
    const [paperTitleSuccess, setPaperTitleSuccess] = useState<string | null>(null);
    const [paperGeneralInstructions, setPaperGeneralInstructions] = useState(initialInstructionSections.generalInstructions);
    const [paperMarkingScheme, setPaperMarkingScheme] = useState(initialInstructionSections.markingScheme);
    const [savingPaperInstructions, setSavingPaperInstructions] = useState(false);
    const [paperInstructionsError, setPaperInstructionsError] = useState<string | null>(null);
    const [paperInstructionsSuccess, setPaperInstructionsSuccess] = useState<string | null>(null);
    const [mode, setMode] = useState<"view" | "edit">("view");
    const [uploadFolderName, setUploadFolderName] = useState(DEFAULT_UPLOAD_FOLDER);
    const [uploadFolderDraft, setUploadFolderDraft] = useState(DEFAULT_UPLOAD_FOLDER);
    const [uploadFolderSaved, setUploadFolderSaved] = useState(false);

    const [activeSubject, setActiveSubject] = useState<string>(() => questions[0]?.subjectName ?? "");
    const [activeSection, setActiveSection] = useState<string>("");

    const [editOpenForQuestionId, setEditOpenForQuestionId] = useState<string | null>(null);
    const [editUiMode, setEditUiMode] = useState<"form" | "json">("form");
    const [editRaw, setEditRaw] = useState("");
    const [loadingEdit, setLoadingEdit] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    const [copyingEdit, setCopyingEdit] = useState(false);
    const [uploadingQuestionImage, setUploadingQuestionImage] = useState(false);
    const [uploadingOptionImage, setUploadingOptionImage] = useState(false);
    const [tableRowsDraft, setTableRowsDraft] = useState(4);
    const [tableColsDraft, setTableColsDraft] = useState(4);
    const [editError, setEditError] = useState<string | null>(null);
    const [editSuccess, setEditSuccess] = useState<string | null>(null);
    const [previewByQuestionId, setPreviewByQuestionId] = useState<Record<string, AdvancedPaperQuestion>>({});
    const [availableSchemesByQuestionId, setAvailableSchemesByQuestionId] = useState<Record<string, string[]>>({});
    const [issueOpenForQuestionId, setIssueOpenForQuestionId] = useState<string | null>(null);
    const [issue, setIssue] = useState("Wrong answer");
    const [details, setDetails] = useState("");
    const [sendingIssue, setSendingIssue] = useState(false);
    const [issueError, setIssueError] = useState<string | null>(null);
    const [issueSavedForQuestionId, setIssueSavedForQuestionId] = useState<Record<string, boolean>>({});
    const [issuesOpenForQuestionId, setIssuesOpenForQuestionId] = useState<string | null>(null);
    const [loadingIssuesForQuestionId, setLoadingIssuesForQuestionId] = useState<string | null>(null);
    const [issuesErrorForQuestionId, setIssuesErrorForQuestionId] = useState<Record<string, string | null>>({});
    const [issuesByQuestionId, setIssuesByQuestionId] = useState<Record<string, QuestionIssueItem[]>>({});
    const [issueCountByQuestionId, setIssueCountByQuestionId] = useState<Record<string, number>>({});
    const questionCardRefs = useRef<Record<string, HTMLElement | null>>({});

    function scrollToQuestionCard(questionId: string) {
        const target = questionCardRefs.current[questionId];
        if (!target) return;
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        // Keep keyboard context on the edited question card after save.
        target.focus({ preventScroll: true });
    }

    const parsedEditRaw = useMemo(() => {
        if (!editRaw.trim()) return null;
        try {
            return JSON.parse(editRaw) as Record<string, unknown>;
        } catch {
            return null;
        }
    }, [editRaw]);

    const issueQuestion = useMemo(
        () => viewerQuestions.find((q) => q.id === issueOpenForQuestionId) ?? null,
        [viewerQuestions, issueOpenForQuestionId],
    );

    const subjects = useMemo(() => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const q of viewerQuestions) {
            if (seen.has(q.subjectName)) continue;
            seen.add(q.subjectName);
            out.push(q.subjectName);
        }
        return out;
    }, [viewerQuestions]);

    const subjectQuestions = useMemo(
        () => viewerQuestions.filter((q) => !activeSubject || q.subjectName === activeSubject),
        [viewerQuestions, activeSubject],
    );

    const sections = useMemo(() => {
        const seen = new Set<string>();
        const out: Array<{ code: string; title: string }> = [];
        for (const q of subjectQuestions) {
            const k = `${q.sectionCode}::${q.sectionTitle}`;
            if (seen.has(k)) continue;
            seen.add(k);
            out.push({ code: q.sectionCode, title: q.sectionTitle });
        }
        return out;
    }, [subjectQuestions]);

    const filteredQuestions = useMemo(() => {
        const base = subjectQuestions;
        if (!activeSection) return base;
        return base.filter((q) => q.sectionCode === activeSection);
    }, [subjectQuestions, activeSection]);

    const activeUploadFolder = slugifyFolderName(uploadFolderName) || DEFAULT_UPLOAD_FOLDER;
    const draftUploadFolder = slugifyFolderName(uploadFolderDraft) || DEFAULT_UPLOAD_FOLDER;
    const isUploadFolderDirty = draftUploadFolder !== activeUploadFolder;
    const uploadFolderStorageKey = `admin-adv-upload-folder:${examId}`;

    useEffect(() => {
        try {
            const stored = localStorage.getItem(uploadFolderStorageKey);
            const normalized = stored ? (slugifyFolderName(stored) || DEFAULT_UPLOAD_FOLDER) : "";
            if (!normalized) return;
            setUploadFolderName(normalized);
            setUploadFolderDraft(normalized);
        } catch {
            // Ignore localStorage access issues (private mode, quota, etc.).
        }
    }, [uploadFolderStorageKey]);

    useEffect(() => {
        setUploadFolderSaved(!isUploadFolderDirty);
    }, [isUploadFolderDirty]);

    function saveUploadFolder() {
        const next = slugifyFolderName(uploadFolderDraft) || DEFAULT_UPLOAD_FOLDER;
        setUploadFolderName(next);
        setUploadFolderDraft(next);
        try {
            localStorage.setItem(uploadFolderStorageKey, next);
        } catch {
            // Ignore localStorage access issues (private mode, quota, etc.).
        }
    }

    async function savePaperTitle() {
        const nextTitle = paperTitle.trim();
        if (!nextTitle) {
            setPaperTitleError("Paper name is required.");
            setPaperTitleSuccess(null);
            return;
        }

        setSavingPaperTitle(true);
        setPaperTitleError(null);
        setPaperTitleSuccess(null);
        try {
            const res = await fetch(`/api/v2/admin/exams/${examId}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ title: nextTitle }),
            });
            if (!res.ok) {
                const txt = await res.text().catch(() => "");
                throw new Error(txt || `${res.status} ${res.statusText}`);
            }
            setPaperTitle(nextTitle);
            setPaperTitleSuccess("Paper name updated.");
        } catch (e) {
            setPaperTitleError(e instanceof Error ? e.message : "Failed to update paper name");
        } finally {
            setSavingPaperTitle(false);
        }
    }

    async function savePaperInstructions() {
        const mergedInstructions = composeInstructionSections({
            generalInstructions: paperGeneralInstructions,
            markingScheme: paperMarkingScheme,
        });

        setSavingPaperInstructions(true);
        setPaperInstructionsError(null);
        setPaperInstructionsSuccess(null);

        try {
            const res = await fetch(`/api/v2/admin/exams/${examId}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ instructionsRichText: mergedInstructions || null }),
            });
            if (!res.ok) {
                const txt = await res.text().catch(() => "");
                throw new Error(txt || `${res.status} ${res.statusText}`);
            }

            setPaperInstructionsSuccess("Instructions and marking scheme updated.");
        } catch (e) {
            setPaperInstructionsError(e instanceof Error ? e.message : "Failed to update instructions");
        } finally {
            setSavingPaperInstructions(false);
        }
    }

    async function openEdit(questionId: string) {
        setEditOpenForQuestionId(questionId);
        setEditUiMode("form");
        setEditError(null);
        setEditSuccess(null);
        setEditRaw("");
        setLoadingEdit(true);

        if (!uploadFolderName.trim()) {
            const fallbackFolder = slugifyFolderName(paperTitle) || DEFAULT_UPLOAD_FOLDER;
            setUploadFolderName(fallbackFolder);
            setUploadFolderDraft(fallbackFolder);
            try {
                localStorage.setItem(uploadFolderStorageKey, fallbackFolder);
            } catch {
                // Ignore localStorage access issues (private mode, quota, etc.).
            }
        }

        try {
            const res = await fetch(`/api/v2/admin/questions/${questionId}`, { cache: "no-store" });
            if (!res.ok) {
                const txt = await res.text().catch(() => "");
                throw new Error(`${res.status} ${res.statusText} ${txt}`);
            }

            const data = (await res.json()) as { question?: EditPayload };
            const loadedQuestion = data.question;
            if (!loadedQuestion) {
                throw new Error("Invalid question payload");
            }
            setEditRaw(JSON.stringify(loadedQuestion, null, 2));
            if (Array.isArray(loadedQuestion.availableMarkingSchemes)) {
                const options = loadedQuestion.availableMarkingSchemes
                    .map((name) => String(name).trim())
                    .filter(Boolean);
                setAvailableSchemesByQuestionId((prev) => ({
                    ...prev,
                    [questionId]: options,
                }));
            }
        } catch (e) {
            const fallback = viewerQuestions.find((q) => q.id === questionId);
            if (fallback) {
                setEditRaw(JSON.stringify(toEditPayload(fallback), null, 2));
            }
            setEditError(e instanceof Error ? e.message : "Failed to load question for edit");
        } finally {
            setLoadingEdit(false);
        }
    }

    function updateEditPayload(mutator: (payload: Record<string, unknown>) => void) {
        let payload: Record<string, unknown>;
        try {
            payload = JSON.parse(editRaw) as Record<string, unknown>;
        } catch {
            setEditError("Invalid JSON. Switch to Raw JSON and fix syntax first.");
            return;
        }

        mutator(payload);
        setEditRaw(JSON.stringify(payload, null, 2));
        setEditError(null);
    }

    function updateEditOptionField(optionKey: string, patch: { labelRich?: string; imageUrls?: string[] }) {
        updateEditPayload((payload) => {
            const current = Array.isArray(payload.options) ? payload.options : [];
            const options = current
                .map((item) => {
                    if (!item || typeof item !== "object") return null;
                    const row = item as Record<string, unknown>;
                    const key = String(row.optionKey ?? "").trim();
                    if (!key) return null;
                    return {
                        optionKey: key,
                        labelRich: String(row.labelRich ?? ""),
                        imageUrls: asStringArray(row.imageUrls),
                    };
                })
                .filter((x): x is { optionKey: string; labelRich: string; imageUrls: string[] } => Boolean(x));

            const idx = options.findIndex((o) => o.optionKey === optionKey);
            if (idx >= 0) {
                options[idx] = {
                    ...options[idx],
                    labelRich: patch.labelRich !== undefined ? patch.labelRich : options[idx].labelRich,
                    imageUrls: patch.imageUrls !== undefined ? patch.imageUrls : options[idx].imageUrls,
                };
            } else {
                options.push({ optionKey, labelRich: patch.labelRich ?? "", imageUrls: patch.imageUrls ?? [] });
            }

            payload.options = options;
        });
    }

    function replaceTableTemplateInQuestion() {
        const template = buildPipeTableTemplate(tableRowsDraft, tableColsDraft);
        updateEditPayload((payload) => {
            const current = String(payload.questionText ?? "");
            payload.questionText = replaceFirstPipeTableBlock(current, template);
        });
        setEditSuccess("Table inserted. Existing table replaced if present.");
    }

    async function copyEditJson() {
        if (!editRaw.trim() || copyingEdit) return;
        setCopyingEdit(true);
        setEditError(null);
        try {
            await navigator.clipboard.writeText(editRaw);
            setEditSuccess("JSON copied to clipboard.");
        } catch {
            setEditError("Could not copy JSON. Please copy manually.");
        } finally {
            setCopyingEdit(false);
        }
    }

    function previewEdit(source: AdvancedPaperQuestion) {
        if (!editOpenForQuestionId) return;

        setEditError(null);
        setEditSuccess(null);

        let payloadObj: Record<string, unknown>;
        try {
            payloadObj = JSON.parse(editRaw) as Record<string, unknown>;
        } catch {
            setEditError("Invalid JSON. Please fix the payload before preview.");
            return;
        }

        const payload = coerceEditPayload(payloadObj);
        if (!payload) {
            setEditError("JSON shape is invalid for preview.");
            return;
        }

        const preview: AdvancedPaperQuestion = {
            ...source,
            questionType: payload.questionType,
            questionText: payload.questionText,
            imageUrls: payload.questionImageUrls,
            markingSchemeName: payload.markingSchemeName?.trim() || source.markingSchemeName,
            options: payload.options.map((o) => ({
                key: o.optionKey,
                text: o.labelRich,
                imageUrl: o.imageUrls.join("\n") || null,
            })),
            correctAnswer: parseCorrectAnswerForUi(payload.questionType, payload.correctAnswerText),
        };

        setPreviewByQuestionId((prev) => ({ ...prev, [editOpenForQuestionId]: preview }));
    }

    async function saveEdit(sourceQuestion: AdvancedPaperQuestion) {
        if (!editOpenForQuestionId || savingEdit) return;
        const savedQuestionId = editOpenForQuestionId;

        if (isUploadFolderDirty) {
            setEditError("Please click Save folder first. Upload folder changes are not saved yet.");
            setEditSuccess(null);
            return;
        }

        let payload: EditPayload;
        try {
            const parsed = JSON.parse(editRaw) as unknown;
            const normalized = coerceEditPayload(parsed);
            if (!normalized) throw new Error("Invalid JSON shape");
            payload = normalized;
        } catch {
            setEditError("Invalid JSON. Please fix the payload before saving.");
            return;
        }

        setSavingEdit(true);
        setEditError(null);
        setEditSuccess(null);

        try {
            const res = await fetch(`/api/v2/admin/questions/${editOpenForQuestionId}`, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
            });

            const data = (await res.json().catch(() => ({}))) as {
                error?: string;
                question?: {
                    id: string;
                    questionType: QuestionType;
                    stemRich: string;
                    stemAssets: unknown;
                    payload: unknown;
                    marksScheme?: { name: string } | null;
                    options: Array<{ optionKey: string; labelRich: string; assets: unknown }>;
                };
            };

            if (!res.ok || !data.question) {
                throw new Error(data.error ?? `Failed to save (${res.status})`);
            }

            const payloadObj = data.question.payload && typeof data.question.payload === "object" && !Array.isArray(data.question.payload)
                ? (data.question.payload as Record<string, unknown>)
                : null;

            const updatedQuestion: AdvancedPaperQuestion = {
                ...sourceQuestion,
                questionType: data.question.questionType,
                questionText: data.question.stemRich,
                imageUrls: parseAssetsToUrls(data.question.stemAssets),
                markingSchemeName: data.question.marksScheme?.name ?? (payload.markingSchemeName?.trim() || null),
                options: data.question.options.map((o) => ({
                    key: o.optionKey,
                    text: o.labelRich,
                    imageUrl: parseAssetsToUrls(o.assets).join("\n") || null,
                })),
                correctAnswer: payloadObj?.correctAnswer ?? sourceQuestion.correctAnswer,
            };

            setViewerQuestions((prev) => prev.map((q) => (q.id === updatedQuestion.id ? updatedQuestion : q)));
            setPreviewByQuestionId((prev) => {
                const next = { ...prev };
                delete next[updatedQuestion.id];
                return next;
            });

            setEditOpenForQuestionId(null);
            setEditError(null);
            setEditSuccess(null);
            setEditRaw("");
            setEditUiMode("form");
            window.setTimeout(() => {
                scrollToQuestionCard(savedQuestionId);
            }, 0);
        } catch (e) {
            setEditError(e instanceof Error ? e.message : "Failed to save question");
        } finally {
            setSavingEdit(false);
        }
    }

    async function uploadImageFile(file: File): Promise<string> {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("folderName", `${ADV_UPLOAD_PREFIX}/${slugifyFolderName(uploadFolderName) || DEFAULT_UPLOAD_FOLDER}`);

        const res = await fetch("/api/admin/uploads/image", {
            method: "POST",
            body: fd,
        });

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(text || `${res.status} ${res.statusText}`);
        }

        const data = (await res.json()) as { url?: string; error?: string; details?: string };
        if (!data.url) throw new Error(data.error || data.details || "Upload failed");
        return data.url;
    }

    function updateEditQuestionImageUrl(newUrl: string) {
        updateEditPayload((payload) => {
            const urls = asStringArray(payload.questionImageUrls);
            if (!urls.includes(newUrl)) urls.push(newUrl);
            payload.questionImageUrls = urls;
        });
    }

    function updateEditOptionImageUrl(optionKey: string, newUrl: string) {
        const normalizedOptionKey = optionKey.trim();
        updateEditPayload((payload) => {
            const current = Array.isArray(payload.options) ? payload.options : [];
            const options = current
                .map((item) => {
                    if (!item || typeof item !== "object") return null;
                    const row = item as Record<string, unknown>;
                    const key = String(row.optionKey ?? "").trim();
                    if (!key) return null;
                    return {
                        optionKey: key,
                        labelRich: String(row.labelRich ?? ""),
                        imageUrls: asStringArray(row.imageUrls),
                    };
                })
                .filter((x): x is { optionKey: string; labelRich: string; imageUrls: string[] } => Boolean(x));

            const idx = options.findIndex((o) => o.optionKey === normalizedOptionKey);
            if (idx >= 0) {
                const nextUrls = options[idx].imageUrls;
                if (!nextUrls.includes(newUrl)) nextUrls.push(newUrl);
                options[idx] = { ...options[idx], imageUrls: nextUrls };
            }

            payload.options = options;
        });
    }

    async function uploadQuestionImages(files: File[]) {
        if (!files.length) return;
        setEditError(null);
        setEditSuccess(null);
        setUploadingQuestionImage(true);
        try {
            for (const file of files) {
                const url = await uploadImageFile(file);
                updateEditQuestionImageUrl(url);
            }
            setEditSuccess("Question image uploaded and inserted.");
        } catch (e) {
            setEditError(e instanceof Error ? e.message : "Failed to upload question image");
        } finally {
            setUploadingQuestionImage(false);
        }
    }

    async function uploadOptionImage(file: File, optionKey: string) {
        setEditError(null);
        setEditSuccess(null);
        setUploadingOptionImage(true);
        try {
            const url = await uploadImageFile(file);
            updateEditOptionImageUrl(optionKey, url);
            setEditSuccess(`Option ${optionKey} image uploaded and inserted.`);
        } catch (e) {
            setEditError(e instanceof Error ? e.message : "Failed to upload option image");
        } finally {
            setUploadingOptionImage(false);
        }
    }

    function onQuestionDrop(e: DragEvent<HTMLDivElement>) {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith("image/"));
        void uploadQuestionImages(files);
    }

    function onOptionDrop(optionKey: string, e: DragEvent<HTMLDivElement>) {
        e.preventDefault();
        const file = Array.from(e.dataTransfer.files || []).find((f) => f.type.startsWith("image/"));
        if (file) void uploadOptionImage(file, optionKey);
    }

    async function loadQuestionIssues(questionId: string) {
        setLoadingIssuesForQuestionId(questionId);
        setIssuesErrorForQuestionId((prev) => ({ ...prev, [questionId]: null }));
        try {
            const res = await fetch(`/api/v2/admin/questions/${questionId}/issue`, { cache: "no-store" });
            if (!res.ok) {
                const txt = await res.text().catch(() => "");
                throw new Error(`${res.status} ${res.statusText} ${txt}`);
            }

            const data = (await res.json()) as { reports?: QuestionIssueItem[] };
            const reports = Array.isArray(data.reports) ? data.reports : [];
            setIssuesByQuestionId((prev) => ({ ...prev, [questionId]: reports }));
            setIssueCountByQuestionId((prev) => ({ ...prev, [questionId]: reports.length }));
        } catch (e) {
            setIssuesErrorForQuestionId((prev) => ({
                ...prev,
                [questionId]: e instanceof Error ? e.message : "Failed to load issue reports",
            }));
        } finally {
            setLoadingIssuesForQuestionId((prev) => (prev === questionId ? null : prev));
        }
    }

    async function toggleQuestionIssues(questionId: string) {
        if (issuesOpenForQuestionId === questionId) {
            setIssuesOpenForQuestionId(null);
            return;
        }

        setIssuesOpenForQuestionId(questionId);
        await loadQuestionIssues(questionId);
    }

    async function submitIssue() {
        if (!issueQuestion || sendingIssue) return;

        const trimmedIssue = issue.trim();
        const trimmedDetails = details.trim();
        if (!trimmedIssue) {
            setIssueError("Issue title is required.");
            return;
        }

        setSendingIssue(true);
        setIssueError(null);
        try {
            const res = await fetch(`/api/v2/admin/questions/${issueQuestion.id}/issue`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    issue: trimmedIssue,
                    details: trimmedDetails ? trimmedDetails : undefined,
                }),
            });

            if (!res.ok) {
                const txt = await res.text().catch(() => "");
                throw new Error(`${res.status} ${res.statusText} ${txt}`);
            }

            setIssueSavedForQuestionId((prev) => ({ ...prev, [issueQuestion.id]: true }));
            setIssueCountByQuestionId((prev) => ({
                ...prev,
                [issueQuestion.id]: Math.max(1, (prev[issueQuestion.id] ?? 0) + 1),
            }));
            setIssuesByQuestionId((prev) => {
                const next = { ...prev };
                delete next[issueQuestion.id];
                return next;
            });
            if (issuesOpenForQuestionId === issueQuestion.id) {
                void loadQuestionIssues(issueQuestion.id);
            }

            setIssueOpenForQuestionId(null);
            setDetails("");
            setIssue("Wrong answer");
        } catch (e) {
            setIssueError(e instanceof Error ? e.message : "Failed to submit issue");
        } finally {
            setSendingIssue(false);
        }
    }

    return (
        <MathJaxContext config={mathjaxConfig}>
            <div className="min-h-screen flex flex-col">
                <header
                    className="sticky top-0 z-50 border-b backdrop-blur-md"
                    style={{
                        borderColor: "var(--border)",
                        background: "color-mix(in srgb, var(--background) 88%, transparent)",
                    }}
                >
                    <div className="max-w-6xl mx-auto px-4 py-2">
                        <div className="rounded-2xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                            <div className="flex flex-nowrap items-center gap-2 sm:gap-3 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                                <div className="inline-flex items-center gap-2 shrink-0">
                                    <div
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold"
                                        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                    >
                                        A
                                    </div>
                                    <span className="text-sm sm:text-base font-semibold whitespace-nowrap">Admin panel</span>
                                </div>

                                <button
                                    type="button"
                                    className="inline-flex shrink-0 items-center justify-center h-9 rounded-full border px-3 text-xs font-medium whitespace-nowrap ui-click"
                                    style={{
                                        borderColor: mode === "edit" ? "rgba(59, 130, 246, 0.5)" : "var(--border)",
                                        background: mode === "edit"
                                            ? "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(14,165,233,0.9))"
                                            : "var(--muted)",
                                        color: mode === "edit" ? "#e0f2fe" : undefined,
                                    }}
                                    onClick={() => setMode((prev) => (prev === "view" ? "edit" : "view"))}
                                >
                                    {mode === "edit" ? "Edit mode" : "View mode"}
                                </button>

                                <Link
                                    href="/admin/papers"
                                    className="inline-flex shrink-0 items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                >
                                    Papers
                                </Link>

                                {mode === "edit" ? (
                                    <>
                                        <div
                                            className="h-9 inline-flex items-center rounded-full border px-3 w-[10.5rem] sm:w-[12rem] md:w-[13rem] shrink-0"
                                            style={uploadFolderSaved
                                                ? {
                                                    borderColor: "rgba(34, 197, 94, 0.65)",
                                                    background: "rgba(20, 83, 45, 0.12)",
                                                }
                                                : {
                                                    borderColor: "rgba(239, 68, 68, 0.6)",
                                                    background: "rgba(127, 29, 29, 0.1)",
                                                }}
                                        >
                                            <span className="text-xs opacity-70 shrink-0">{ADV_UPLOAD_PREFIX}/</span>
                                            <input
                                                className="ml-1 min-w-0 w-full bg-transparent text-[11px] sm:text-xs outline-none"
                                                value={uploadFolderDraft}
                                                onChange={(e) => {
                                                    setUploadFolderDraft(e.target.value);
                                                }}
                                                placeholder={DEFAULT_UPLOAD_FOLDER}
                                            />
                                        </div>

                                        <button
                                            type="button"
                                            className="inline-flex shrink-0 items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                            style={{
                                                borderColor: uploadFolderSaved ? "rgba(34, 197, 94, 0.75)" : "rgba(239, 68, 68, 0.75)",
                                                background: uploadFolderSaved ? "rgba(20, 83, 45, 0.35)" : "rgba(127, 29, 29, 0.28)",
                                                color: uploadFolderSaved ? "#bbf7d0" : "#fecaca",
                                            }}
                                            onClick={saveUploadFolder}
                                        >
                                            {uploadFolderSaved ? "Saved" : "Save folder"}
                                        </button>
                                    </>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </header>

                <main className="max-w-6xl mx-auto w-full px-4 py-8">
                    <section className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                        <div className="flex flex-wrap items-center gap-2">
                            {mode === "edit" ? (
                                <>
                                    <input
                                        className="h-9 w-full sm:w-[22rem] rounded border px-3 bg-transparent text-lg font-semibold ui-field"
                                        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                        value={paperTitle}
                                        onChange={(e) => {
                                            setPaperTitle(e.target.value);
                                            setPaperTitleSuccess(null);
                                            setPaperTitleError(null);
                                        }}
                                        placeholder="Paper name"
                                        disabled={savingPaperTitle}
                                    />
                                    <button
                                        type="button"
                                        className="inline-flex h-9 items-center justify-center rounded-full border px-3 text-xs ui-click"
                                        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                        onClick={() => void savePaperTitle()}
                                        disabled={savingPaperTitle || paperTitle.trim().length === 0}
                                    >
                                        {savingPaperTitle ? "Saving..." : "Save name"}
                                    </button>
                                </>
                            ) : (
                                <h1 className="text-xl font-semibold">{paperTitle}</h1>
                            )}
                        </div>

                        {paperTitleError ? <div className="mt-1 text-xs text-red-500">{paperTitleError}</div> : null}
                        {paperTitleSuccess ? <div className="mt-1 text-xs text-emerald-500">{paperTitleSuccess}</div> : null}

                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs opacity-75">
                            <span>{examCode}</span>
                            <span>•</span>
                            <span>{viewerQuestions.length} questions</span>
                            <span>•</span>
                            <span>{durationMinutes} mins</span>
                        </div>

                        {mode === "edit" ? (
                            <div className="mt-3 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                                <div className="text-sm font-medium">Pre-start Content</div>
                                <div className="mt-2 space-y-3">
                                    <div className="rounded border p-2" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                                        <div className="text-xs font-medium opacity-80">General Instructions</div>
                                        <textarea
                                            className="mt-2 w-full min-h-[160px] rounded border px-3 py-2 bg-transparent ui-field text-sm"
                                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                            value={paperGeneralInstructions}
                                            onChange={(e) => {
                                                setPaperGeneralInstructions(e.target.value);
                                                setPaperInstructionsError(null);
                                                setPaperInstructionsSuccess(null);
                                            }}
                                            placeholder="Write the instructions shown before the exam starts."
                                            disabled={savingPaperInstructions}
                                        />
                                        <div className="mt-2 rounded border p-2" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                                            <div className="text-[11px] opacity-70">Preview</div>
                                            <InstructionRichText text={paperGeneralInstructions} className="mt-1 text-sm leading-relaxed opacity-90" />
                                        </div>
                                    </div>

                                    <div className="rounded border p-2" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                                        <div className="text-xs font-medium opacity-80">Marking Scheme</div>
                                        <textarea
                                            className="mt-2 w-full min-h-[160px] rounded border px-3 py-2 bg-transparent ui-field text-sm"
                                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                            value={paperMarkingScheme}
                                            onChange={(e) => {
                                                setPaperMarkingScheme(e.target.value);
                                                setPaperInstructionsError(null);
                                                setPaperInstructionsSuccess(null);
                                            }}
                                            placeholder="Write marking details, positive/negative marks, partial marks, etc."
                                            disabled={savingPaperInstructions}
                                        />
                                        <div className="mt-2 rounded border p-2" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                                            <div className="text-[11px] opacity-70">Preview</div>
                                            <InstructionRichText text={paperMarkingScheme} className="mt-1 text-sm leading-relaxed opacity-90" />
                                        </div>
                                    </div>
                                </div>

                                {paperInstructionsError ? <div className="mt-2 text-xs text-red-500">{paperInstructionsError}</div> : null}
                                {paperInstructionsSuccess ? <div className="mt-2 text-xs text-emerald-500">{paperInstructionsSuccess}</div> : null}

                                <div className="mt-2 flex justify-end">
                                    <button
                                        type="button"
                                        className="inline-flex h-8 items-center justify-center rounded-full border px-3 text-xs ui-click"
                                        style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                        onClick={() => void savePaperInstructions()}
                                        disabled={savingPaperInstructions}
                                    >
                                        {savingPaperInstructions ? "Saving..." : "Save pre-start content"}
                                    </button>
                                </div>
                            </div>
                        ) : paperGeneralInstructions.trim() || paperMarkingScheme.trim() ? (
                            <div className="mt-3 space-y-2">
                                {paperGeneralInstructions.trim() ? (
                                    <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                                        <div className="text-[11px] font-medium opacity-75">General Instructions</div>
                                        <InstructionRichText text={paperGeneralInstructions} className="mt-1 text-xs opacity-85" />
                                    </div>
                                ) : null}
                                {paperMarkingScheme.trim() ? (
                                    <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                                        <div className="text-[11px] font-medium opacity-75">Marking Scheme</div>
                                        <InstructionRichText text={paperMarkingScheme} className="mt-1 text-xs opacity-85" />
                                    </div>
                                ) : null}
                            </div>
                        ) : null}

                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                            {subjects.map((subject) => (
                                <button
                                    key={subject}
                                    className={`inline-flex h-8 items-center justify-center rounded-full border px-3 text-xs ui-click ${activeSubject === subject ? `font-semibold ring-2 ring-white/35 ${subjectTone(subject)}` : "bg-[var(--muted)]"}`}
                                    style={{ borderColor: "var(--border)" }}
                                    onClick={() => {
                                        setActiveSubject(subject);
                                        setActiveSection("");
                                    }}
                                >
                                    {subject}
                                </button>
                            ))}
                        </div>

                        <div className="mt-2.5 flex flex-wrap gap-2">
                            <button
                                className={`inline-flex h-7 items-center justify-center rounded-full border px-3 text-xs ui-click ${activeSection === "" ? "font-semibold bg-sky-600/80 text-sky-50" : "bg-[var(--muted)]"}`}
                                style={{ borderColor: "var(--border)" }}
                                onClick={() => setActiveSection("")}
                            >
                                All sections
                            </button>
                            {sections.map((section) => (
                                <button
                                    key={section.code}
                                    className={`inline-flex h-7 items-center justify-center rounded-full border px-3 text-xs ui-click ${activeSection === section.code ? "font-semibold bg-sky-600/80 text-sky-50" : "bg-[var(--muted)]"}`}
                                    style={{ borderColor: "var(--border)" }}
                                    onClick={() => setActiveSection(section.code)}
                                >
                                    {formatSectionLabel(section.code)}
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="mt-5 grid gap-3">
                        {filteredQuestions.map((q) => {
                            const isEditing = editOpenForQuestionId === q.id;
                            const editPayload = isEditing ? coerceEditPayload(parsedEditRaw) : null;
                            const preview = previewByQuestionId[q.id] ?? null;
                            const display = preview ?? q;
                            const isNumerical = display.questionType === "NAT_INTEGER" || display.questionType === "NAT_DECIMAL";
                            const matchingStem = display.questionType === "MATCHING_LIST"
                                ? parseMatchingStem(display.questionText)
                                : null;
                            const editMatchingStem = editPayload?.questionType === "MATCHING_LIST"
                                ? parseMatchingStem(editPayload.questionText)
                                : null;

                            return (
                                <article
                                    key={q.id}
                                    id={`question-card-${q.id}`}
                                    ref={(node) => {
                                        questionCardRefs.current[q.id] = node;
                                    }}
                                    tabIndex={-1}
                                    className="rounded-2xl border p-4"
                                    style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] opacity-70">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="inline-flex h-7 items-center rounded-full border px-2" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>Q{q.index}</span>
                                            <span>{q.subjectName}</span>
                                            <span>•</span>
                                            <span>{formatSectionLabel(display.sectionCode)}</span>
                                            <span>•</span>
                                            <span>{display.questionType}</span>
                                            {display.topicName ? (
                                                <>
                                                    <span>•</span>
                                                    <span className="opacity-85">{display.topicName}</span>
                                                </>
                                            ) : null}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 justify-start sm:justify-end">
                                            {mode === "edit" ? (
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center justify-center h-8 rounded-full border px-3 text-xs ui-click"
                                                    style={{ borderColor: "var(--border)", background: "var(--muted)", opacity: 1 }}
                                                    onClick={() => void openEdit(q.id)}
                                                >
                                                    Edit question
                                                </button>
                                            ) : null}
                                            {issueSavedForQuestionId[q.id] ? (
                                                <span
                                                    className="text-xs rounded-full border px-2 py-0.5"
                                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                                >
                                                    Issue reported
                                                </span>
                                            ) : null}
                                            <button
                                                type="button"
                                                className="inline-flex items-center justify-center h-8 rounded-full border px-3 text-xs ui-click"
                                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                                onClick={() => {
                                                    setIssueError(null);
                                                    setIssue("Wrong answer");
                                                    setDetails("");
                                                    setIssueOpenForQuestionId(q.id);
                                                }}
                                            >
                                                Report issue
                                            </button>
                                            <button
                                                type="button"
                                                className="inline-flex items-center justify-center h-8 rounded-full border px-3 text-xs ui-click"
                                                style={(issueCountByQuestionId[q.id] ?? 0) > 0 || issueSavedForQuestionId[q.id] || issuesOpenForQuestionId === q.id
                                                    ? {
                                                        borderColor: "rgba(239, 68, 68, 0.75)",
                                                        background: "rgba(127, 29, 29, 0.25)",
                                                        color: "#fecaca",
                                                    }
                                                    : { borderColor: "var(--border)", background: "var(--muted)" }}
                                                onClick={() => void toggleQuestionIssues(q.id)}
                                                disabled={loadingIssuesForQuestionId === q.id}
                                            >
                                                {loadingIssuesForQuestionId === q.id
                                                    ? "Loading issues..."
                                                    : issuesOpenForQuestionId === q.id
                                                        ? `Hide issues (${issueCountByQuestionId[q.id] ?? 0})`
                                                        : `Issues (${issueCountByQuestionId[q.id] ?? 0})`}
                                            </button>
                                        </div>
                                    </div>

                                    {issuesOpenForQuestionId === q.id ? (
                                        <div className="mt-3 rounded border p-3" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                                            <div className="text-xs font-semibold">Reported issues for this question</div>
                                            {issuesErrorForQuestionId[q.id] ? (
                                                <div className="mt-2 text-xs text-red-500">{issuesErrorForQuestionId[q.id]}</div>
                                            ) : null}
                                            {loadingIssuesForQuestionId === q.id ? (
                                                <div className="mt-2 text-xs opacity-70">Loading...</div>
                                            ) : null}
                                            {!loadingIssuesForQuestionId && !issuesErrorForQuestionId[q.id] ? (
                                                (issuesByQuestionId[q.id] ?? []).length ? (
                                                    <div className="mt-2 grid gap-2">
                                                        {(issuesByQuestionId[q.id] ?? []).map((item) => (
                                                            <div
                                                                key={item.id}
                                                                className="rounded border p-2 text-xs"
                                                                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                                            >
                                                                <div className="flex flex-wrap items-center gap-2 opacity-80">
                                                                    <span className="rounded-full border px-2 py-0.5" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                                                                        {item.source}
                                                                    </span>
                                                                    <span>
                                                                        {new Intl.DateTimeFormat("en-IN", {
                                                                            dateStyle: "medium",
                                                                            timeStyle: "short",
                                                                            timeZone: "Asia/Kolkata",
                                                                        }).format(new Date(item.createdAt))}
                                                                    </span>
                                                                    {item.reporterUsername ? <span>by {item.reporterUsername}</span> : null}
                                                                </div>
                                                                <div className="mt-1 font-medium">{item.issue}</div>
                                                                {item.details ? <div className="mt-1 opacity-80">{item.details}</div> : null}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="mt-2 text-xs opacity-70">No issues reported for this question yet.</div>
                                                )
                                            ) : null}
                                        </div>
                                    ) : null}

                                    <div className="mt-3 text-sm leading-relaxed">
                                        {display.imageUrls.length ? (
                                            <div className="mb-3 grid gap-2 sm:grid-cols-2">
                                                {display.imageUrls.map((url) => (
                                                    <div key={url} className="rounded border p-2 flex items-center justify-center min-h-28" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img src={optimizeImageDelivery(url)} alt="Question" className="max-w-full max-h-72 object-contain" />
                                                    </div>
                                                ))}
                                            </div>
                                        ) : null}
                                        {display.questionType === "MATCHING_LIST" && matchingStem ? (
                                            <div className="space-y-3">
                                                {matchingStem.intro.length ? (
                                                    <div className="space-y-1">
                                                        {matchingStem.intro.map((line, idx) => (
                                                            <div key={`matching-intro-${q.id}-${idx}`}>
                                                                <MathJax dynamic>{normalizeMatchingLineForMathJax(line)}</MathJax>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : null}

                                                <div className="overflow-x-auto rounded border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                                                    <table className="min-w-full text-sm">
                                                        <thead>
                                                            <tr style={{ background: "var(--muted)" }}>
                                                                <th className="px-3 py-2 text-left font-semibold border-b border-r" style={{ borderColor: "var(--border)" }}>List-I</th>
                                                                <th className="px-3 py-2 text-left font-semibold border-b" style={{ borderColor: "var(--border)" }}>List-II</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {Array.from({ length: Math.max(matchingStem.listI.length, matchingStem.listII.length) }).map((_, rowIdx) => (
                                                                <tr key={`matching-row-${q.id}-${rowIdx}`}>
                                                                    <td className="align-top px-3 py-2 border-b border-r" style={{ borderColor: "var(--border)" }}>
                                                                        {matchingStem.listI[rowIdx] ? <MathJax dynamic>{normalizeMatchingLineForMathJax(matchingStem.listI[rowIdx])}</MathJax> : null}
                                                                    </td>
                                                                    <td className="align-top px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                                                                        {matchingStem.listII[rowIdx] ? <MathJax dynamic>{normalizeMatchingLineForMathJax(matchingStem.listII[rowIdx])}</MathJax> : null}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                {matchingStem.outro.length ? (
                                                    <div className="space-y-1">
                                                        {matchingStem.outro.map((line, idx) => (
                                                            <div key={`matching-outro-${q.id}-${idx}`}>
                                                                <MathJax dynamic>{normalizeMatchingLineForMathJax(line)}</MathJax>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </div>
                                        ) : (
                                            <RichStemContent text={display.questionText} />
                                        )}
                                    </div>

                                    {isNumerical ? (
                                        <div className="mt-3 inline-flex h-8 items-center rounded-full border px-3 text-xs" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                                            Correct Answer: {formatAnswer(display.correctAnswer)}
                                        </div>
                                    ) : (
                                        <div className="mt-3 grid gap-2">
                                            {display.options.map((o) => {
                                                const optionImageUrls = o.imageUrl ? splitUrlList(o.imageUrl) : [];
                                                const correct = isCorrectOption(display, o.key);
                                                return (
                                                    <div key={o.key} className="rounded border p-3" style={{ borderColor: correct ? "rgba(16,185,129,0.7)" : "var(--border)", background: correct ? "rgba(16,185,129,0.12)" : "transparent" }}>
                                                        <div className="text-sm">
                                                            <span className="opacity-75">({o.key}) </span>
                                                            <MathJax inline dynamic>{o.text}</MathJax>
                                                        </div>
                                                        {optionImageUrls.length ? (
                                                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                                                {optionImageUrls.map((url) => (
                                                                    <div key={url} className="rounded border p-2 flex items-center justify-center min-h-20" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                        <img src={optimizeImageDelivery(url)} alt={`Option ${o.key}`} className="max-w-full max-h-56 object-contain" />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {isEditing && mode === "edit" ? (
                                        <div className="mt-3 rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                                            <div className="text-base font-semibold">Edit question</div>
                                            <div className="mt-0.5 text-xs opacity-75">
                                                Use Form editor for easy updates. Raw JSON remains available for advanced edits.
                                            </div>

                                            <div className="mt-2 inline-flex rounded-full border p-1" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center justify-center h-7 rounded-full px-3 text-xs font-medium ui-click"
                                                    style={{
                                                        border: "1px solid transparent",
                                                        background: editUiMode === "form" ? "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(14,165,233,0.9))" : "transparent",
                                                        color: editUiMode === "form" ? "#e0f2fe" : "inherit",
                                                    }}
                                                    onClick={() => setEditUiMode("form")}
                                                    disabled={loadingEdit || savingEdit}
                                                >
                                                    Form editor
                                                </button>
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center justify-center h-7 rounded-full px-3 text-xs font-medium ui-click"
                                                    style={{
                                                        border: "1px solid transparent",
                                                        background: editUiMode === "json" ? "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(14,165,233,0.9))" : "transparent",
                                                        color: editUiMode === "json" ? "#e0f2fe" : "inherit",
                                                    }}
                                                    onClick={() => setEditUiMode("json")}
                                                    disabled={loadingEdit || savingEdit}
                                                >
                                                    Raw JSON
                                                </button>
                                            </div>

                                            {editUiMode === "form" ? (
                                                editPayload ? (
                                                    <div className="mt-2 grid gap-2">
                                                        <label className="block">
                                                            <div className="text-xs opacity-70">Question type</div>
                                                            <input
                                                                className="mt-1 w-full rounded border px-2.5 py-1.5 bg-transparent ui-field text-sm"
                                                                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                                                value={editPayload.questionType}
                                                                disabled
                                                            />
                                                        </label>

                                                        <label className="block">
                                                            <div className="text-xs opacity-70">Question text (supports LaTeX)</div>
                                                            <textarea
                                                                className="mt-1 w-full min-h-[96px] rounded border px-2.5 py-2 bg-transparent ui-field text-sm"
                                                                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                                                value={editPayload.questionText}
                                                                onChange={(e) => updateEditPayload((payload) => { payload.questionText = e.target.value; })}
                                                                disabled={loadingEdit || savingEdit}
                                                            />
                                                        </label>

                                                        <div className="rounded border p-2" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                                                            <div className="text-xs font-medium">Table builder</div>
                                                            <div className="mt-1 text-[11px] opacity-75">
                                                                Insert editable markdown table template. Adding a new template replaces the existing table block. Use ![alt](https://...) inside cells for images.
                                                            </div>
                                                            <div className="mt-2 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-1.5">
                                                                <label className="text-xs">
                                                                    <div className="opacity-70 mb-1">Rows</div>
                                                                    <input
                                                                        type="number"
                                                                        min={1}
                                                                        max={20}
                                                                        className="w-full rounded border px-2 py-1.5 bg-transparent ui-field"
                                                                        style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                                                        value={tableRowsDraft}
                                                                        onChange={(e) => setTableRowsDraft(Math.max(1, Number.parseInt(e.target.value || "1", 10) || 1))}
                                                                        disabled={loadingEdit || savingEdit}
                                                                    />
                                                                </label>
                                                                <label className="text-xs">
                                                                    <div className="opacity-70 mb-1">Columns</div>
                                                                    <input
                                                                        type="number"
                                                                        min={2}
                                                                        max={8}
                                                                        className="w-full rounded border px-2 py-1.5 bg-transparent ui-field"
                                                                        style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                                                        value={tableColsDraft}
                                                                        onChange={(e) => setTableColsDraft(Math.max(2, Number.parseInt(e.target.value || "2", 10) || 2))}
                                                                        disabled={loadingEdit || savingEdit}
                                                                    />
                                                                </label>
                                                                <div className="self-end">
                                                                    <button
                                                                        type="button"
                                                                        className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                                                        style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                                                        onClick={replaceTableTemplateInQuestion}
                                                                        disabled={loadingEdit || savingEdit}
                                                                    >
                                                                        Insert / Replace Table
                                                                    </button>
                                                                </div>
                                                            </div>

                                                        </div>

                                                        <div className="rounded border px-2.5 py-2 text-xs" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                                                            <div className="mb-1 opacity-70">Question LaTeX preview</div>
                                                            <div className="text-sm leading-relaxed">
                                                                {editPayload.questionType === "MATCHING_LIST" && editMatchingStem ? (
                                                                    <div className="space-y-3">
                                                                        {editMatchingStem.intro.length ? (
                                                                            <div className="space-y-1">
                                                                                {editMatchingStem.intro.map((line, idx) => (
                                                                                    <div key={`edit-matching-intro-${q.id}-${idx}`}>
                                                                                        <MathJax dynamic>{normalizeMatchingLineForMathJax(line)}</MathJax>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        ) : null}

                                                                        <div className="overflow-x-auto rounded border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                                                                            <table className="min-w-full text-sm">
                                                                                <thead>
                                                                                    <tr style={{ background: "var(--muted)" }}>
                                                                                        <th className="px-3 py-2 text-left font-semibold border-b border-r" style={{ borderColor: "var(--border)" }}>List-I</th>
                                                                                        <th className="px-3 py-2 text-left font-semibold border-b" style={{ borderColor: "var(--border)" }}>List-II</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    {Array.from({ length: Math.max(editMatchingStem.listI.length, editMatchingStem.listII.length) }).map((_, rowIdx) => (
                                                                                        <tr key={`edit-matching-row-${q.id}-${rowIdx}`}>
                                                                                            <td className="align-top px-3 py-2 border-b border-r" style={{ borderColor: "var(--border)" }}>
                                                                                                {editMatchingStem.listI[rowIdx] ? <MathJax dynamic>{normalizeMatchingLineForMathJax(editMatchingStem.listI[rowIdx])}</MathJax> : null}
                                                                                            </td>
                                                                                            <td className="align-top px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                                                                                                {editMatchingStem.listII[rowIdx] ? <MathJax dynamic>{normalizeMatchingLineForMathJax(editMatchingStem.listII[rowIdx])}</MathJax> : null}
                                                                                            </td>
                                                                                        </tr>
                                                                                    ))}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>

                                                                        {editMatchingStem.outro.length ? (
                                                                            <div className="space-y-1">
                                                                                {editMatchingStem.outro.map((line, idx) => (
                                                                                    <div key={`edit-matching-outro-${q.id}-${idx}`}>
                                                                                        <MathJax dynamic>{normalizeMatchingLineForMathJax(line)}</MathJax>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        ) : null}
                                                                    </div>
                                                                ) : (
                                                                    <RichStemContent text={editPayload.questionText} />
                                                                )}
                                                            </div>
                                                        </div>

                                                        <label className="block">
                                                            <div className="text-xs opacity-70">Correct answer</div>
                                                            <input
                                                                className="mt-1 w-full rounded border px-2.5 py-1.5 bg-transparent ui-field text-sm"
                                                                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                                                value={editPayload.correctAnswerText}
                                                                onChange={(e) => updateEditPayload((payload) => { payload.correctAnswerText = e.target.value; })}
                                                                placeholder={editPayload.questionType === "MULTI_CORRECT" ? "A, C" : "e.g. B or 42"}
                                                                disabled={loadingEdit || savingEdit}
                                                            />
                                                        </label>

                                                        <label className="block">
                                                            <div className="text-xs opacity-70">Marking scheme name</div>
                                                            {availableSchemesByQuestionId[q.id]?.length ? (
                                                                <select
                                                                    className="mt-1 w-full rounded border px-2.5 py-1.5 bg-transparent ui-field text-sm"
                                                                    style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                                                    value={editPayload.markingSchemeName ?? ""}
                                                                    onChange={(e) => updateEditPayload((payload) => { payload.markingSchemeName = e.target.value; })}
                                                                    disabled={loadingEdit || savingEdit}
                                                                >
                                                                    {availableSchemesByQuestionId[q.id].map((schemeName) => (
                                                                        <option key={schemeName} value={schemeName}>{schemeName}</option>
                                                                    ))}
                                                                </select>
                                                            ) : (
                                                                <input
                                                                    className="mt-1 w-full rounded border px-2.5 py-1.5 bg-transparent ui-field text-sm"
                                                                    style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                                                    value={editPayload.markingSchemeName ?? ""}
                                                                    onChange={(e) => updateEditPayload((payload) => { payload.markingSchemeName = e.target.value; })}
                                                                    placeholder="e.g. V2_ADV_MULTI_4_3_2_1_N2"
                                                                    disabled={loadingEdit || savingEdit}
                                                                />
                                                            )}
                                                        </label>

                                                        <label className="block">
                                                            <div className="text-xs opacity-70">Question image URLs (one per line)</div>
                                                            <div
                                                                className="mt-1 rounded border p-1.5"
                                                                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                                                onDragOver={(e) => e.preventDefault()}
                                                                onDrop={onQuestionDrop}
                                                            >
                                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                                                    <textarea
                                                                        className="w-full min-h-[72px] rounded border px-2.5 py-1.5 bg-transparent ui-field text-xs"
                                                                        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                                                        value={editPayload.questionImageUrls.join("\n")}
                                                                        onChange={(e) => updateEditPayload((payload) => { payload.questionImageUrls = splitUrlList(e.target.value); })}
                                                                        disabled={loadingEdit || savingEdit}
                                                                        placeholder="Question image URL(s), one per line"
                                                                    />

                                                                    <label
                                                                        className="inline-flex items-center justify-center min-h-[72px] rounded border px-2 text-[11px] text-center ui-click cursor-pointer"
                                                                        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                                                    >
                                                                        {uploadingQuestionImage ? "Uploading..." : "Drag/drop or upload question image"}
                                                                        <input
                                                                            type="file"
                                                                            accept="image/*"
                                                                            multiple
                                                                            className="hidden"
                                                                            disabled={uploadingQuestionImage}
                                                                            onChange={(e) => {
                                                                                const files = Array.from(e.target.files ?? []);
                                                                                void uploadQuestionImages(files);
                                                                                e.currentTarget.value = "";
                                                                            }}
                                                                        />
                                                                    </label>
                                                                </div>
                                                            </div>
                                                        </label>

                                                        {(editPayload.questionType === "NAT_INTEGER" || editPayload.questionType === "NAT_DECIMAL") ? null : (
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                                                                {editPayload.options.map((option) => (
                                                                    <div key={`option-editor-${option.optionKey}`} className="rounded border p-2" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                                                                        <div className="text-xs font-medium">Option {option.optionKey}</div>
                                                                        <textarea
                                                                            className="mt-1 w-full min-h-[44px] rounded border px-2 py-1.5 bg-transparent ui-field text-sm"
                                                                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                                                            value={option.labelRich}
                                                                            onChange={(e) => updateEditOptionField(option.optionKey, { labelRich: e.target.value })}
                                                                            disabled={loadingEdit || savingEdit}
                                                                            placeholder={`Option ${option.optionKey} text`}
                                                                        />
                                                                        <div className="mt-1 rounded border px-2 py-1 text-xs" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                                                                            <div className="mb-1 opacity-70">Preview</div>
                                                                            <div className="text-sm leading-relaxed">
                                                                                <MathJax dynamic>{option.labelRich}</MathJax>
                                                                            </div>
                                                                        </div>

                                                                        <div
                                                                            className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-1.5 rounded border p-1.5"
                                                                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                                                            onDragOver={(e) => e.preventDefault()}
                                                                            onDrop={(e) => onOptionDrop(option.optionKey, e)}
                                                                        >
                                                                            <input
                                                                                className="w-full rounded border px-2 py-1.5 bg-transparent ui-field text-xs"
                                                                                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                                                                value={option.imageUrls.join("\n")}
                                                                                onChange={(e) => updateEditOptionField(option.optionKey, { imageUrls: splitUrlList(e.target.value) })}
                                                                                disabled={loadingEdit || savingEdit}
                                                                                placeholder={`Option ${option.optionKey} image URL(s)`}
                                                                            />

                                                                            <label
                                                                                className="inline-flex items-center justify-center h-8 w-full text-[11px] rounded-full border px-2 whitespace-nowrap ui-click cursor-pointer"
                                                                                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                                                            >
                                                                                {uploadingOptionImage ? "Uploading..." : `Drag/drop or upload option ${option.optionKey} image`}
                                                                                <input
                                                                                    type="file"
                                                                                    accept="image/*"
                                                                                    className="hidden"
                                                                                    disabled={uploadingOptionImage}
                                                                                    onChange={(e) => {
                                                                                        const file = e.target.files?.[0];
                                                                                        if (file) void uploadOptionImage(file, option.optionKey);
                                                                                        e.currentTarget.value = "";
                                                                                    }}
                                                                                />
                                                                            </label>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="mt-3 rounded border p-3 text-sm text-red-500" style={{ borderColor: "rgba(239, 68, 68, 0.5)", background: "rgba(127, 29, 29, 0.1)" }}>
                                                        Form editor is unavailable because JSON is invalid. Switch to Raw JSON mode and fix syntax first.
                                                    </div>
                                                )
                                            ) : (
                                                <textarea
                                                    className="mt-2 w-full min-h-[260px] rounded border px-2.5 py-2 bg-transparent ui-field font-mono text-xs"
                                                    style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                                    value={editRaw}
                                                    onChange={(e) => setEditRaw(e.target.value)}
                                                    disabled={loadingEdit || savingEdit}
                                                    placeholder={loadingEdit ? "Loading question..." : "Raw question JSON"}
                                                />
                                            )}

                                            {editError ? (
                                                <div className="mt-2 text-sm text-red-600">{editError}</div>
                                            ) : null}
                                            {editSuccess ? (
                                                <div className="mt-2 text-sm text-emerald-500">{editSuccess}</div>
                                            ) : null}

                                            <div className="mt-2 flex flex-wrap items-center justify-start sm:justify-end gap-1.5">
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center justify-center h-8 rounded-full border px-2.5 text-[11px] whitespace-nowrap ui-click"
                                                    style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                                    onClick={() => previewEdit(q)}
                                                    disabled={loadingEdit || savingEdit || uploadingQuestionImage || uploadingOptionImage || !editRaw.trim()}
                                                >
                                                    Preview
                                                </button>
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center justify-center h-8 rounded-full border px-2.5 text-[11px] whitespace-nowrap ui-click"
                                                    style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                                    onClick={() => void copyEditJson()}
                                                    disabled={loadingEdit || savingEdit || uploadingQuestionImage || uploadingOptionImage || copyingEdit || !editRaw.trim()}
                                                >
                                                    {copyingEdit ? "Copying..." : "Copy JSON"}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center justify-center h-8 rounded-full border px-2.5 text-[11px] whitespace-nowrap ui-click"
                                                    style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                                    onClick={() => {
                                                        setEditOpenForQuestionId(null);
                                                        setEditError(null);
                                                        setEditSuccess(null);
                                                        setEditRaw("");
                                                        setEditUiMode("form");
                                                        setPreviewByQuestionId((prev) => {
                                                            const next = { ...prev };
                                                            delete next[q.id];
                                                            return next;
                                                        });
                                                    }}
                                                    disabled={savingEdit || uploadingQuestionImage || uploadingOptionImage}
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center justify-center h-8 rounded-full border px-2.5 text-[11px] font-medium whitespace-nowrap ui-click"
                                                    style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                                    onClick={() => void saveEdit(q)}
                                                    disabled={loadingEdit || savingEdit || uploadingQuestionImage || uploadingOptionImage || !editRaw.trim()}
                                                >
                                                    {savingEdit ? "Saving..." : "Save changes"}
                                                </button>
                                            </div>
                                        </div>
                                    ) : null}
                                </article>
                            );
                        })}

                        {filteredQuestions.length === 0 ? (
                            <div className="rounded-xl border p-6 text-center text-sm opacity-70" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                                No questions in this filter.
                            </div>
                        ) : null}
                    </section>
                </main>

                {issueQuestion ? (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        style={{ background: "rgba(0,0,0,0.45)" }}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Report question issue"
                    >
                        <div
                            className="w-full max-w-md rounded-lg border p-4"
                            style={{ borderColor: "var(--border)", background: "var(--card)" }}
                        >
                            <div className="text-base font-semibold">Report issue for Q{issueQuestion.index}</div>
                            <div className="mt-1 text-sm opacity-70">
                                {issueQuestion.subjectName}
                            </div>

                            <label className="mt-4 block text-sm">
                                <div className="text-xs opacity-70">What is the issue?</div>
                                <select
                                    className="mt-2 w-full rounded border px-3 py-2 bg-transparent ui-field"
                                    style={{ borderColor: "var(--border)" }}
                                    value={issue}
                                    onChange={(e) => setIssue(e.target.value)}
                                    disabled={sendingIssue}
                                >
                                    <option value="">Select...</option>
                                    <option value="Wrong answer">Wrong answer</option>
                                    <option value="Wrong question statement">Wrong question statement</option>
                                    <option value="Typo / formatting">Typo / formatting</option>
                                    <option value="Image missing">Image missing</option>
                                    <option value="Other">Other</option>
                                </select>
                            </label>

                            <label className="mt-3 block text-sm">
                                <div className="text-xs opacity-70">Details (optional)</div>
                                <textarea
                                    className="mt-2 w-full min-h-24 rounded border px-3 py-2 bg-transparent ui-field"
                                    style={{ borderColor: "var(--border)" }}
                                    value={details}
                                    onChange={(e) => setDetails(e.target.value)}
                                    placeholder="Add any extra context"
                                    disabled={sendingIssue}
                                />
                            </label>

                            {issueError ? (
                                <div className="mt-3 text-sm text-red-600">{issueError}</div>
                            ) : null}

                            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                                <button
                                    type="button"
                                    className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs whitespace-nowrap ui-click"
                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                    onClick={() => setIssueOpenForQuestionId(null)}
                                    disabled={sendingIssue}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="inline-flex items-center justify-center h-9 rounded-full border px-3 text-xs font-medium whitespace-nowrap ui-click"
                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                    onClick={() => void submitIssue()}
                                    disabled={sendingIssue || issue.trim().length === 0}
                                >
                                    {sendingIssue ? "Submitting..." : "Submit"}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </MathJaxContext>
    );
}
