"use client";

import { MathJax, MathJaxContext } from "better-react-mathjax";
import { type DragEvent, useMemo, useState } from "react";
import { optimizeImageDelivery } from "@/lib/image-delivery";

type PaperQuestion = {
    id: string;
    index: number;
    issueCount: number;
    subjectName: string;
    topicName: string;
    questionText: string;
    imageUrls: string[];
    options: Array<{ key: string; text: string; imageUrl: string | null }>;
    markingSchemeType: "MAINS_SINGLE" | "MAINS_NUMERICAL" | "ADV_MULTI_CORRECT" | "ADV_NAT";
    correctAnswer: unknown;
};

type EditPreview = {
    topicName: string;
    questionText: string;
    imageUrls: string[];
    options: Array<{ key: string; text: string; imageUrl: string | null }>;
    markingSchemeType: "MAINS_SINGLE" | "MAINS_NUMERICAL" | "ADV_MULTI_CORRECT" | "ADV_NAT";
    correctAnswer: unknown;
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

const mathjaxConfig = {
    loader: { load: ["[tex]/mhchem"] },
    tex: {
        packages: { "[+]": ["mhchem"] },
        inlineMath: [["$", "$"], ["\\(", "\\)"]],
        displayMath: [["$$", "$$"], ["\\[", "\\]"]],
    },
} as const;

function isNullLikeToken(s: string): boolean {
    const v = s.trim().toLowerCase();
    return v === "" || v === "null" || v === "none" || v === "na" || v === "n/a" || v === "-";
}

function splitUrlList(raw: string): string[] {
    return raw
        .split(/\r?\n|,|;/g)
        .map((s) => s.trim())
        .filter((s) => !isNullLikeToken(s));
}

function formatAnswer(value: unknown): string {
    if (value == null) return "-";
    if (Array.isArray(value)) return value.map(String).join(", ");
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function isCorrectOption(markingSchemeType: PaperQuestion["markingSchemeType"], correctAnswer: unknown, key: string): boolean {
    if (markingSchemeType === "ADV_MULTI_CORRECT") {
        return Array.isArray(correctAnswer) ? correctAnswer.map(String).includes(key) : false;
    }
    if (markingSchemeType === "MAINS_SINGLE") {
        return String(correctAnswer) === key;
    }
    return false;
}

function coerceOptions(value: unknown): Array<{ key: string; text: string; imageUrl: string | null }> {
    if (Array.isArray(value)) {
        const out: Array<{ key: string; text: string; imageUrl: string | null }> = [];
        for (const item of value) {
            if (!item || typeof item !== "object") continue;
            const k = (item as { key?: unknown }).key;
            if (typeof k !== "string") continue;
            const t = (item as { text?: unknown }).text;
            const i = (item as { imageUrl?: unknown }).imageUrl;
            out.push({ key: k, text: typeof t === "string" ? t : "", imageUrl: typeof i === "string" ? i : null });
        }
        return out;
    }

    if (value && typeof value === "object") {
        return Object.entries(value as Record<string, unknown>).map(([key, raw]) => {
            if (typeof raw === "string") return { key, text: raw, imageUrl: null as string | null };
            if (raw && typeof raw === "object") {
                const t = (raw as { text?: unknown }).text;
                const i = (raw as { imageUrl?: unknown }).imageUrl;
                return {
                    key,
                    text: typeof t === "string" ? t : "",
                    imageUrl: typeof i === "string" ? i : null,
                };
            }
            return { key, text: "", imageUrl: null as string | null };
        });
    }

    return [];
}

function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map(String).map((v) => v.trim()).filter(Boolean);
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

export function AdminPaperViewerClient({
    testTitle,
    questions,
}: {
    testTitle: string;
    questions: PaperQuestion[];
}) {
    const [viewerQuestions, setViewerQuestions] = useState<PaperQuestion[]>(questions);
    const [issueOpenForQuestionId, setIssueOpenForQuestionId] = useState<string | null>(null);
    const [editOpenForQuestionId, setEditOpenForQuestionId] = useState<string | null>(null);
    const [loadingEdit, setLoadingEdit] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    const [copyingEdit, setCopyingEdit] = useState(false);
    const [uploadingQuestionImage, setUploadingQuestionImage] = useState(false);
    const [uploadingOptionImage, setUploadingOptionImage] = useState(false);
    const [uploadFolderName, setUploadFolderName] = useState("paper-images");
    const [uploadFolderDraft, setUploadFolderDraft] = useState("paper-images");
    const [uploadFolderSaved, setUploadFolderSaved] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);
    const [editSuccess, setEditSuccess] = useState<string | null>(null);
    const [editRaw, setEditRaw] = useState("");
    const [previewByQuestionId, setPreviewByQuestionId] = useState<Record<string, EditPreview>>({});
    const [issue, setIssue] = useState("Wrong answer");
    const [details, setDetails] = useState("");
    const [sendingIssue, setSendingIssue] = useState(false);
    const [issueError, setIssueError] = useState<string | null>(null);
    const [issueSavedForQuestionId, setIssueSavedForQuestionId] = useState<Record<string, boolean>>({});
    const [issuesOpenForQuestionId, setIssuesOpenForQuestionId] = useState<string | null>(null);
    const [loadingIssuesForQuestionId, setLoadingIssuesForQuestionId] = useState<string | null>(null);
    const [issuesErrorForQuestionId, setIssuesErrorForQuestionId] = useState<Record<string, string | null>>({});
    const [issuesByQuestionId, setIssuesByQuestionId] = useState<Record<string, QuestionIssueItem[]>>({});
    const [issueCountByQuestionId, setIssueCountByQuestionId] = useState<Record<string, number>>(() => {
        const seeded: Record<string, number> = {};
        for (const q of questions) seeded[q.id] = q.issueCount;
        return seeded;
    });

    const issueQuestion = useMemo(
        () => viewerQuestions.find((q) => q.id === issueOpenForQuestionId) ?? null,
        [viewerQuestions, issueOpenForQuestionId],
    );

    const parsedEditRaw = useMemo(() => {
        if (!editRaw.trim()) return null;
        try {
            return JSON.parse(editRaw) as Record<string, unknown>;
        } catch {
            return null;
        }
    }, [editRaw]);

    const activeUploadFolder = slugifyFolderName(uploadFolderName) || "paper-images";
    const draftUploadFolder = slugifyFolderName(uploadFolderDraft) || "paper-images";
    const isUploadFolderDirty = draftUploadFolder !== activeUploadFolder;

    function saveUploadFolder() {
        setUploadFolderName(uploadFolderDraft);
        setUploadFolderSaved(true);
    }

    async function loadQuestionIssues(questionId: string) {
        setLoadingIssuesForQuestionId(questionId);
        setIssuesErrorForQuestionId((prev) => ({ ...prev, [questionId]: null }));
        try {
            const res = await fetch(`/api/admin/questions/${questionId}/issue`, { cache: "no-store" });
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

    async function openEdit(questionId: string) {
        setEditOpenForQuestionId(questionId);
        setEditError(null);
        setEditSuccess(null);
        setEditRaw("");
        setLoadingEdit(true);
        if (!uploadFolderName.trim()) {
            setUploadFolderName(slugifyFolderName(testTitle) || "paper-images");
        }

        try {
            const res = await fetch(`/api/admin/questions/${questionId}`, { cache: "no-store" });
            if (!res.ok) {
                const txt = await res.text().catch(() => "");
                throw new Error(`${res.status} ${res.statusText} ${txt}`);
            }

            const data = (await res.json()) as {
                question: {
                    subjectId: number;
                    topicName: string;
                    questionText: string;
                    imageUrls: unknown;
                    options: unknown;
                    correctAnswer: unknown;
                    markingSchemeType: "MAINS_SINGLE" | "MAINS_NUMERICAL" | "ADV_MULTI_CORRECT" | "ADV_NAT";
                    difficultyRank: number | null;
                };
            };

            setEditRaw(JSON.stringify(data.question, null, 2));
        } catch (e) {
            setEditError(e instanceof Error ? e.message : "Failed to load question for edit");
        } finally {
            setLoadingEdit(false);
        }
    }

    async function saveEdit() {
        if (!editOpenForQuestionId || savingEdit) return;

        if (isUploadFolderDirty) {
            setEditError("Please click Save folder first. Upload folder changes are not saved yet.");
            setEditSuccess(null);
            return;
        }

        let payload: unknown;
        try {
            payload = JSON.parse(editRaw);
        } catch {
            setEditError("Invalid JSON. Please fix the payload before saving.");
            return;
        }

        setSavingEdit(true);
        setEditError(null);
        setEditSuccess(null);

        try {
            const res = await fetch(`/api/admin/questions/${editOpenForQuestionId}`, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const txt = await res.text().catch(() => "");
                throw new Error(`${res.status} ${res.statusText} ${txt}`);
            }

            const data = (await res.json()) as {
                question: {
                    id: string;
                    topicName: string;
                    questionText: string;
                    imageUrls: unknown;
                    options: unknown;
                    correctAnswer: unknown;
                    markingSchemeType: "MAINS_SINGLE" | "MAINS_NUMERICAL" | "ADV_MULTI_CORRECT" | "ADV_NAT";
                    subjectName: string;
                };
            };

            setViewerQuestions((prev) => prev.map((q) => {
                if (q.id !== editOpenForQuestionId) return q;
                return {
                    ...q,
                    subjectName: data.question.subjectName,
                    topicName: data.question.topicName,
                    questionText: data.question.questionText,
                    imageUrls: asStringArray(data.question.imageUrls),
                    options: coerceOptions(data.question.options),
                    markingSchemeType: data.question.markingSchemeType,
                    correctAnswer: data.question.correctAnswer,
                };
            }));

            setPreviewByQuestionId((prev) => {
                if (!editOpenForQuestionId) return prev;
                const { [editOpenForQuestionId]: _removed, ...rest } = prev;
                return rest;
            });

            setEditOpenForQuestionId(null);
            setEditError(null);
            setEditSuccess(null);
            setEditRaw("");
        } catch (e) {
            setEditError(e instanceof Error ? e.message : "Failed to save question");
        } finally {
            setSavingEdit(false);
        }
    }

    function previewEdit() {
        if (!editOpenForQuestionId) return;

        setEditError(null);
        setEditSuccess(null);

        let payload: Record<string, unknown>;
        try {
            payload = JSON.parse(editRaw) as Record<string, unknown>;
        } catch {
            setEditError("Invalid JSON. Please fix the payload before preview.");
            return;
        }

        const rawScheme = payload.markingSchemeType;
        const scheme =
            rawScheme === "MAINS_SINGLE" ||
                rawScheme === "MAINS_NUMERICAL" ||
                rawScheme === "ADV_MULTI_CORRECT" ||
                rawScheme === "ADV_NAT"
                ? rawScheme
                : null;

        if (!scheme) {
            setEditError("Invalid markingSchemeType in JSON.");
            return;
        }

        setPreviewByQuestionId((prev) => ({
            ...prev,
            [editOpenForQuestionId]: {
                topicName: typeof payload.topicName === "string" ? payload.topicName : "",
                questionText: typeof payload.questionText === "string" ? payload.questionText : "",
                imageUrls: asStringArray(payload.imageUrls),
                options: coerceOptions(payload.options),
                markingSchemeType: scheme,
                correctAnswer: payload.correctAnswer,
            },
        }));
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

    async function uploadImageFile(file: File): Promise<string> {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("folderName", slugifyFolderName(uploadFolderName) || "paper-images");

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
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(editRaw) as Record<string, unknown>;
        } catch {
            throw new Error("Raw JSON is invalid. Fix JSON before uploading images.");
        }

        const current = parsed.imageUrls;
        const urls = Array.isArray(current)
            ? current.map(String).map((x) => x.trim()).filter(Boolean)
            : [];
        if (!urls.includes(newUrl)) urls.push(newUrl);

        parsed.imageUrls = urls;
        setEditRaw(JSON.stringify(parsed, null, 2));
    }

    function updateEditOptionImageUrl(optionKey: string, newUrl: string) {
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(editRaw) as Record<string, unknown>;
        } catch {
            throw new Error("Raw JSON is invalid. Fix JSON before uploading images.");
        }

        const options = parsed.options;
        if (!options || typeof options !== "object") {
            throw new Error("options is missing in raw JSON.");
        }

        if (Array.isArray(options)) {
            const next = options.map((item) => {
                if (!item || typeof item !== "object") return item;
                const key = (item as { key?: unknown }).key;
                if (String(key) !== optionKey) return item;
                return {
                    ...(item as Record<string, unknown>),
                    imageUrl: newUrl,
                };
            });
            parsed.options = next;
            setEditRaw(JSON.stringify(parsed, null, 2));
            return;
        }

        const optionsObj = { ...(options as Record<string, unknown>) };
        const existing = optionsObj[optionKey];
        if (typeof existing === "string") {
            optionsObj[optionKey] = { text: existing, imageUrl: newUrl };
        } else if (existing && typeof existing === "object") {
            optionsObj[optionKey] = {
                ...(existing as Record<string, unknown>),
                imageUrl: newUrl,
            };
        } else {
            optionsObj[optionKey] = { text: "", imageUrl: newUrl };
        }

        parsed.options = optionsObj;
        setEditRaw(JSON.stringify(parsed, null, 2));
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
            setEditSuccess("Question image uploaded and inserted into imageUrls.");
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
            const res = await fetch(`/api/admin/questions/${issueQuestion.id}/issue`, {
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
            <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                <div className="text-lg font-semibold">{testTitle}</div>
                <div className="mt-1 text-sm opacity-70">View all questions and report any issue directly.</div>
            </div>

            <div
                className="mt-3 rounded-lg border p-3 ring-2"
                style={uploadFolderSaved
                    ? {
                        borderColor: "rgba(34, 197, 94, 0.75)",
                        background: "rgba(20, 83, 45, 0.2)",
                        boxShadow: "0 0 0 1px rgba(34, 197, 94, 0.35) inset",
                    }
                    : {
                        borderColor: "rgba(239, 68, 68, 0.75)",
                        background: "rgba(127, 29, 29, 0.18)",
                        boxShadow: "0 0 0 1px rgba(239, 68, 68, 0.35) inset",
                    }}
            >
                <div className="text-xs font-semibold tracking-wide" style={{ color: uploadFolderSaved ? "#bbf7d0" : "#fecaca" }}>
                    Upload folder (inside testseries)
                </div>
                <div className="mt-1 text-xs opacity-70">
                    All uploads go to Cloudinary folder: <span className="font-mono">testseries/{activeUploadFolder}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                        className="w-full max-w-md rounded border px-3 py-2 bg-transparent ui-field text-xs"
                        style={{ borderColor: "var(--border)" }}
                        value={uploadFolderDraft}
                        onChange={(e) => {
                            setUploadFolderDraft(e.target.value);
                            setUploadFolderSaved(false);
                        }}
                        placeholder="e.g. paper5"
                    />
                    <button
                        type="button"
                        className="text-xs rounded-full border px-3 py-1.5 ui-click"
                        style={{
                            borderColor: uploadFolderSaved ? "rgba(34, 197, 94, 0.75)" : "rgba(239, 68, 68, 0.75)",
                            background: uploadFolderSaved ? "rgba(20, 83, 45, 0.35)" : "rgba(127, 29, 29, 0.28)",
                            color: uploadFolderSaved ? "#bbf7d0" : "#fecaca",
                        }}
                        onClick={saveUploadFolder}
                    >
                        {uploadFolderSaved ? "Saved" : "Save folder"}
                    </button>
                </div>
                <div className="mt-2">
                    <span
                        className="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium break-all"
                        style={uploadFolderSaved
                            ? {
                                borderColor: "rgba(34, 197, 94, 0.7)",
                                background: "rgba(20, 83, 45, 0.35)",
                                color: "#bbf7d0",
                            }
                            : {
                                borderColor: "rgba(239, 68, 68, 0.7)",
                                background: "rgba(127, 29, 29, 0.35)",
                                color: "#fecaca",
                            }}
                    >
                        Upload destination: testseries/{activeUploadFolder}
                    </span>
                </div>
            </div>

            <div className="mt-4 grid gap-4">
                {viewerQuestions.map((q) => {
                    const isEditing = editOpenForQuestionId === q.id;
                    const preview = previewByQuestionId[q.id] ?? null;
                    const display = preview
                        ? {
                            ...q,
                            topicName: preview.topicName,
                            questionText: preview.questionText,
                            imageUrls: preview.imageUrls,
                            options: preview.options,
                            markingSchemeType: preview.markingSchemeType,
                            correctAnswer: preview.correctAnswer,
                        }
                        : q;

                    return (
                        <div
                            key={q.id}
                            className="rounded-lg border p-4"
                            style={{ borderColor: "var(--border)", background: "var(--card)" }}
                        >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="text-xs opacity-70">
                                    Q{q.index} · {q.subjectName} · {display.topicName}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 justify-start sm:justify-end">
                                    <button
                                        type="button"
                                        className="text-xs rounded-full border px-3 py-1 ui-click"
                                        style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                        onClick={() => void openEdit(q.id)}
                                    >
                                        Edit question
                                    </button>
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
                                        className="text-xs rounded-full border px-3 py-1 ui-click"
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
                                        className="text-xs rounded-full border px-3 py-1 ui-click"
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
                                                            <span>{new Date(item.createdAt).toLocaleString()}</span>
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

                            <div className="mt-4 text-base leading-relaxed">
                                {display.imageUrls.length ? (
                                    <div className={`mb-3 grid gap-2 mx-auto ${display.imageUrls.length > 1 ? "sm:grid-cols-2 max-w-3xl" : "max-w-4xl"}`}>
                                        {display.imageUrls.map((url) => (
                                            <div
                                                key={url}
                                                className={`rounded border p-2 flex items-center justify-center w-full relative ${display.imageUrls.length > 1 ? "h-44 sm:h-56" : "h-64 sm:h-80"}`}
                                                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                            >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={optimizeImageDelivery(url)}
                                                    alt="Question"
                                                    className="max-w-full max-h-full object-contain"
                                                    loading="lazy"
                                                    decoding="async"
                                                    referrerPolicy="no-referrer"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                                <MathJax dynamic>{display.questionText}</MathJax>
                            </div>

                            <div className="mt-4 grid gap-2">
                                {display.markingSchemeType === "MAINS_NUMERICAL" || display.markingSchemeType === "ADV_NAT" ? (
                                    <div className="rounded border p-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                                        Correct answer: <span className="font-medium">{formatAnswer(display.correctAnswer)}</span>
                                    </div>
                                ) : (
                                    display.options.map((o) => {
                                        const optionImageUrls = o.imageUrl ? splitUrlList(o.imageUrl) : [];
                                        const optionHasMultipleImages = optionImageUrls.length > 1;
                                        const correct = isCorrectOption(display.markingSchemeType, display.correctAnswer, o.key);

                                        return (
                                            <div
                                                key={o.key}
                                                className={`rounded border p-3 ${correct ? "ring-1 ring-emerald-500" : ""}`}
                                                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className="text-xs font-mono opacity-70">{o.key}.</div>
                                                    <div className="min-w-0 text-sm leading-relaxed">
                                                        <MathJax dynamic>{o.text}</MathJax>

                                                        {optionImageUrls.length ? (
                                                            <div className={`mt-2 grid gap-2 ${optionHasMultipleImages ? "sm:grid-cols-2" : ""}`}>
                                                                {optionImageUrls.map((url) => (
                                                                    <div
                                                                        key={url}
                                                                        className={`rounded border p-2 flex items-center justify-center w-full relative ${optionHasMultipleImages ? "h-32 sm:h-40" : "h-40 sm:h-48"}`}
                                                                        style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                                                    >
                                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                        <img
                                                                            src={optimizeImageDelivery(url)}
                                                                            alt={`Option ${o.key}`}
                                                                            className="max-w-full max-h-full object-contain"
                                                                            loading="lazy"
                                                                            decoding="async"
                                                                            referrerPolicy="no-referrer"
                                                                        />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                    {correct ? (
                                                        <div className="text-xs text-emerald-400 shrink-0">Correct</div>
                                                    ) : null}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {isEditing ? (
                                <div className="mt-4 rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                                    <div className="text-base font-semibold">Edit question</div>
                                    <div className="mt-1 text-sm opacity-70">
                                        Update any field (options, answers, text, images, scheme) and save to DB.
                                    </div>

                                    <textarea
                                        className="mt-3 w-full min-h-[340px] rounded border px-3 py-2 bg-transparent ui-field font-mono text-xs"
                                        style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                        value={editRaw}
                                        onChange={(e) => setEditRaw(e.target.value)}
                                        disabled={loadingEdit || savingEdit}
                                        placeholder={loadingEdit ? "Loading question..." : "Raw question JSON"}
                                    />

                                    <div className="mt-3 grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
                                        <div
                                            className="w-full rounded border p-3"
                                            style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={onQuestionDrop}
                                        >
                                            <div className="text-xs font-medium">Question images</div>
                                            <div className="mt-1 text-xs opacity-70">Drag and drop image(s) here or pick files.</div>
                                            <label
                                                className="mt-2 inline-flex text-xs rounded-full border px-3 py-1 ui-click cursor-pointer"
                                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                            >
                                                {uploadingQuestionImage ? "Uploading..." : "Upload question image"}
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

                                        {(["A", "B", "C", "D"] as const).map((key) => (
                                            <div
                                                key={key}
                                                className="w-full rounded border p-3"
                                                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={(e) => onOptionDrop(key, e)}
                                            >
                                                <div className="text-xs font-medium">Option {key} image</div>
                                                <div className="mt-1 text-xs opacity-70">Drag and drop one image here for option {key}.</div>
                                                <label
                                                    className="mt-2 inline-flex text-xs rounded-full border px-3 py-1 ui-click cursor-pointer"
                                                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                                >
                                                    {uploadingOptionImage ? "Uploading..." : `Upload Option ${key}`}
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        className="hidden"
                                                        disabled={uploadingOptionImage}
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) void uploadOptionImage(file, key);
                                                            e.currentTarget.value = "";
                                                        }}
                                                    />
                                                </label>
                                            </div>
                                        ))}
                                    </div>

                                    {editError ? (
                                        <div className="mt-2 text-sm text-red-600">{editError}</div>
                                    ) : null}
                                    {editSuccess ? (
                                        <div className="mt-2 text-sm text-emerald-500">{editSuccess}</div>
                                    ) : null}

                                    <div className="mt-4 flex flex-wrap items-center justify-start sm:justify-end gap-2">
                                        <button
                                            type="button"
                                            className="text-xs rounded-full border px-3 py-1 ui-click"
                                            style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                            onClick={previewEdit}
                                            disabled={loadingEdit || savingEdit || uploadingQuestionImage || uploadingOptionImage || !editRaw.trim()}
                                        >
                                            Preview
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs rounded-full border px-3 py-1 ui-click"
                                            style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                            onClick={() => void copyEditJson()}
                                            disabled={loadingEdit || savingEdit || uploadingQuestionImage || uploadingOptionImage || copyingEdit || !editRaw.trim()}
                                        >
                                            {copyingEdit ? "Copying..." : "Copy JSON"}
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs rounded-full border px-3 py-1 ui-click"
                                            style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                            onClick={() => {
                                                setEditOpenForQuestionId(null);
                                                setEditError(null);
                                                setEditSuccess(null);
                                                setEditRaw("");
                                                setPreviewByQuestionId((prev) => {
                                                    const { [q.id]: _removed, ...rest } = prev;
                                                    return rest;
                                                });
                                            }}
                                            disabled={savingEdit || uploadingQuestionImage || uploadingOptionImage}
                                        >
                                            Close
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs font-medium rounded-full border px-3 py-1 ui-click"
                                            style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                            onClick={() => void saveEdit()}
                                            disabled={loadingEdit || savingEdit || uploadingQuestionImage || uploadingOptionImage || !editRaw.trim()}
                                        >
                                            {savingEdit ? "Saving..." : "Save changes"}
                                        </button>
                                    </div>

                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </div>

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
                            {issueQuestion.subjectName} · {issueQuestion.topicName}
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
                                className="text-xs rounded-full border px-3 py-1 ui-click"
                                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                onClick={() => setIssueOpenForQuestionId(null)}
                                disabled={sendingIssue}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="text-xs font-medium rounded-full border px-3 py-1 ui-click"
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

        </MathJaxContext>
    );
}
