"use client";

import { MathJax, MathJaxContext } from "better-react-mathjax";
import { OptionContent, QuestionContent } from "@/components/common/MathText";
import { MediaImageGroup } from "@/components/common/QuestionMediaLayout";
import type { QuestionOption } from "@/lib/types";

const mathjaxConfig = {
    loader: { load: ["[tex]/mhchem"] },
    tex: {
        packages: { "[+]": ["mhchem"] },
        inlineMath: [["$", "$"], ["\\(", "\\)"]],
        displayMath: [["$$", "$$"], ["\\[", "\\]"]],
    },
} as const;

type IssueReportItem = {
    id: string;
    createdAt: string;
    issue: string;
    details: string | null;
    attemptId: string | null;
    reporterName: string | null;
    reporterUsername: string | null;
    reporterId: string | null;
    attemptOwnerName: string | null;
    attemptOwnerUsername: string | null;
    attemptOwnerId: string | null;
    testTitle: string | null;
    source: "student" | "admin";
};

export type IssueQuestionGroup = {
    questionId: string;
    subjectName: string | null;
    topicName: string | null;
    questionText: string | null;
    imageUrls: string[] | null;
    options: unknown;
    reports: IssueReportItem[];
    latestCreatedAt: string;
};

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

function toOptionFromValue(key: string, raw: unknown): QuestionOption {
    if (typeof raw === "string") {
        return { key, text: raw, imageUrl: null };
    }

    if (raw && typeof raw === "object") {
        const maybeText = (raw as any).text;
        const maybeImageUrl = (raw as any).imageUrl;
        return {
            key,
            text: typeof maybeText === "string" ? maybeText : "",
            imageUrl: typeof maybeImageUrl === "string" ? maybeImageUrl : null,
        };
    }

    return { key, text: "", imageUrl: null };
}

function coerceOptions(value: unknown): QuestionOption[] {
    let parsed = value;

    if (typeof parsed === "string") {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            return [];
        }
    }

    if (Array.isArray(parsed)) {
        const out: QuestionOption[] = [];
        for (const item of parsed) {
            if (!item || typeof item !== "object") continue;
            const maybeKey = (item as any).key;
            if (typeof maybeKey !== "string") continue;
            out.push(toOptionFromValue(maybeKey, item));
        }
        return out;
    }

    if (parsed && typeof parsed === "object") {
        return Object.entries(parsed as Record<string, unknown>).map(([key, raw]) =>
            toOptionFromValue(key, raw),
        );
    }

    return [];
}

function fmtDate(iso: string) {
    try {
        return new Intl.DateTimeFormat("en-IN", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Kolkata",
        }).format(new Date(iso));
    } catch {
        return iso;
    }
}

export function IssueReportsClient({ groups }: { groups: IssueQuestionGroup[] }) {
    return (
        <MathJaxContext config={mathjaxConfig}>
            <div className="grid gap-3 overflow-x-hidden">
                {groups.map((g, idx) => {
                    const options = coerceOptions(g.options);
                    const questionText = (g.questionText ?? "").trim();

                    return (
                        <div
                            key={g.questionId}
                            className="rounded-2xl border p-4 overflow-hidden"
                            style={{ borderColor: "var(--border)", background: "var(--card)" }}
                        >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="text-xs opacity-70">
                                    Q{idx + 1}
                                    {g.subjectName ? ` · ${g.subjectName}` : ""}
                                    {g.topicName ? ` · ${g.topicName}` : ""}
                                </div>
                                <div className="text-xs opacity-60">Latest: {fmtDate(g.latestCreatedAt)}</div>
                            </div>

                            <div className="mt-3 min-w-0 text-base leading-relaxed">
                                {questionText || g.imageUrls?.length ? (
                                    <QuestionContent text={questionText} imageUrls={g.imageUrls ?? []} />
                                ) : (
                                    <div className="text-sm opacity-70">Question not found.</div>
                                )}
                            </div>

                            {options.length ? (
                                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                                    {options.map((o) => {
                                        const optionImageUrls = o.imageUrl ? splitUrlList(o.imageUrl) : [];

                                        return (
                                            <div
                                                key={o.key}
                                                className="rounded border p-3 overflow-hidden"
                                                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className="mt-0.5 text-xs opacity-70 shrink-0">({o.key})</div>
                                                    <div className="min-w-0 flex-1">
                                                        {o.text ? (
                                                            <div className="text-sm min-w-0 overflow-x-auto">
                                                                <OptionContent text={o.text} />
                                                            </div>
                                                        ) : null}

                                                        {optionImageUrls.length ? (
                                                            <MediaImageGroup
                                                                imageUrls={optionImageUrls}
                                                                altBase={`Option ${o.key}`}
                                                                variant="option"
                                                                maxImageHeight={320}
                                                                className="mt-2"
                                                            />
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : null}

                            <div className="mt-4 text-xs opacity-70">QuestionId: {g.questionId}</div>

                            <div className="mt-4 grid gap-2">
                                {g.reports.map((r) => {
                                    const reporterLabel = r.reporterUsername
                                        ? `${r.reporterName ?? "—"} (${r.reporterUsername})`
                                        : (r.reporterName ?? r.reporterId ?? "—");
                                    const ownerLabel = r.attemptOwnerUsername
                                        ? `${r.attemptOwnerName ?? "—"} (${r.attemptOwnerUsername})`
                                        : (r.attemptOwnerName ?? r.attemptOwnerId ?? "—");
                                    const meta = [
                                        fmtDate(r.createdAt),
                                        r.testTitle ?? "—",
                                        `Source: ${r.source === "admin" ? "Admin report" : "Student report"}`,
                                        `Reported by: ${reporterLabel}`,
                                        `Attempt owner: ${ownerLabel}`,
                                    ]
                                        .filter(Boolean)
                                        .join(" · ");

                                    return (
                                        <div
                                            key={r.id}
                                            className="rounded border p-3"
                                            style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                                        >
                                            <div className="flex flex-wrap items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="text-sm font-medium break-words">{r.issue}</div>
                                                    <div className="mt-1 text-xs opacity-70 break-words">{meta}</div>
                                                </div>
                                                <div className="text-xs opacity-70 break-all">AttemptId: {r.attemptId ?? "-"}</div>
                                            </div>

                                            {r.details ? (
                                                <div className="mt-2 text-sm whitespace-pre-wrap">{r.details}</div>
                                            ) : (
                                                <div className="mt-2 text-sm opacity-70">No comment provided.</div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}

                {groups.length === 0 ? (
                    <div className="text-sm opacity-70">No issue reports yet.</div>
                ) : null}
            </div>
        </MathJaxContext>
    );
}
