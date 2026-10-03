"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { optimizeImageDelivery } from "@/lib/image-delivery";
import styles from "./QuestionMediaLayout.module.css";

export type MediaImageVariant = "question" | "option" | "inline";

export type MediaImageGroupProps = {
    imageUrls: string[];
    altBase: string;
    variant?: MediaImageVariant;
    maxColumns?: number;
    maxImageHeight?: number;
    frameAspectRatio?: number;
    className?: string;
    onImageAspectRatio?: (imageUrl: string, aspectRatio: number) => void;
};

function cleanUrls(imageUrls: string[]) {
    return imageUrls.map((url) => url.trim()).filter(Boolean);
}

/** Renders an image set without a carousel or horizontal scrolling. */
export function MediaImageGroup({
    imageUrls,
    altBase,
    variant = "question",
    maxColumns,
    maxImageHeight = 320,
    frameAspectRatio = 1.4,
    className = "",
    onImageAspectRatio,
}: MediaImageGroupProps) {
    const urls = cleanUrls(imageUrls);
    if (!urls.length) return null;

    const columns = Math.min(urls.length, maxColumns ?? (variant === "option" ? 2 : urls.length));
    const groupClass = variant === "option"
        ? styles.optionImages
        : variant === "inline"
            ? styles.inlineImages
            : styles.questionImages;

    return (
        <div
            className={`${groupClass} ${className}`.trim()}
            style={{
                "--media-columns": columns,
                "--media-image-height": `${maxImageHeight}px`,
                "--media-frame-ratio": frameAspectRatio,
            } as CSSProperties}
        >
            {urls.map((url, index) => (
                <div className={styles.imageFrame} key={`${url}-${index}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={optimizeImageDelivery(url)}
                        alt={`${altBase} ${index + 1}`}
                        className={styles.image}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        onLoad={(event) => {
                            const image = event.currentTarget;
                            if (image.naturalHeight > 0) {
                                onImageAspectRatio?.(url, image.naturalWidth / image.naturalHeight);
                            }
                        }}
                    />
                </div>
            ))}
        </div>
    );
}

export type QuestionMediaLayoutProps = {
    children: ReactNode;
    imageUrls: string[];
    altBase?: string;
    hasText?: boolean;
    className?: string;
    textClassName?: string;
    imageClassName?: string;
    maxColumns?: number;
    maxImageHeight?: number;
    frameAspectRatio?: number;
    horizontalAspectThreshold?: number;
};

/** Places multiple images above the question, and a single image by its natural aspect ratio. */
export function QuestionMediaLayout({
    children,
    imageUrls,
    altBase = "Question image",
    hasText = true,
    className = "",
    textClassName = "",
    imageClassName = "",
    maxColumns,
    maxImageHeight = 320,
    frameAspectRatio = 1.4,
    horizontalAspectThreshold = 2,
}: QuestionMediaLayoutProps) {
    const urls = cleanUrls(imageUrls);
    const signature = urls.join("\u0000");
    const [imageRatios, setImageRatios] = useState<{ signature: string; ratios: Record<string, number> }>({ signature: "", ratios: {} });
    if (!urls.length) return <div className={className}>{children}</div>;

    const isMultipleImageQuestion = urls.length > 1;
    const currentRatios = imageRatios.signature === signature ? imageRatios.ratios : {};
    const singleImageIsWide = !isMultipleImageQuestion && (currentRatios[urls[0]] ?? 0) >= horizontalAspectThreshold;
    const placeImagesAboveText = isMultipleImageQuestion || singleImageIsWide;

    return (
        <div className={`${styles.questionLayout} ${placeImagesAboveText ? styles.stackedQuestionLayout : ""} ${hasText ? "" : styles.imageOnly} ${className}`.trim()}>
            {hasText ? <div className={`${styles.questionText} ${textClassName}`.trim()}>{children}</div> : null}
            <MediaImageGroup
                imageUrls={urls}
                altBase={altBase}
                variant="question"
                maxColumns={maxColumns}
                maxImageHeight={maxImageHeight}
                frameAspectRatio={frameAspectRatio}
                className={imageClassName}
                onImageAspectRatio={!isMultipleImageQuestion ? (imageUrl, aspectRatio) => {
                    setImageRatios((current) => {
                        const ratios = current.signature === signature ? current.ratios : {};
                        if (ratios[imageUrl] === aspectRatio) return current;
                        return { signature, ratios: { ...ratios, [imageUrl]: aspectRatio } };
                    });
                } : undefined}
            />
        </div>
    );
}
