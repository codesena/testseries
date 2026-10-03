"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
    const [imageRatios, setImageRatios] = useState<Record<string, number>>({});
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const triggerButtonRef = useRef<HTMLButtonElement | null>(null);
    const lightboxUrl = lightboxIndex === null ? null : urls[lightboxIndex] ?? null;

    useEffect(() => {
        if (variant !== "question" || lightboxIndex === null || !lightboxUrl) return;

        const previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setLightboxIndex(null);
            if (event.key === "Tab") {
                event.preventDefault();
                closeButtonRef.current?.focus();
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        closeButtonRef.current?.focus();

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.body.style.overflow = previousBodyOverflow;
            triggerButtonRef.current?.focus();
        };
    }, [lightboxIndex, lightboxUrl, variant]);

    if (!urls.length) return null;

    const columns = Math.min(urls.length, maxColumns ?? (variant === "option" ? 2 : urls.length));
    const groupClass = variant === "option"
        ? styles.optionImages
        : variant === "inline"
            ? styles.inlineImages
            : styles.questionImages;

    function handleImageLoad(imageUrl: string, image: HTMLImageElement) {
        if (image.naturalHeight <= 0) return;
        const aspectRatio = image.naturalWidth / image.naturalHeight;
        onImageAspectRatio?.(imageUrl, aspectRatio);
        setImageRatios((current) => current[imageUrl] === aspectRatio
            ? current
            : { ...current, [imageUrl]: aspectRatio });
    }

    return (
        <>
            <div
                className={`${groupClass} ${className}`.trim()}
                data-responsive-columns={maxColumns == null && urls.length > 1 ? "true" : undefined}
                style={{
                    "--media-columns": columns,
                    "--media-image-height": `${maxImageHeight}px`,
                    "--media-frame-ratio": frameAspectRatio,
                } as CSSProperties}
            >
                {urls.map((url, index) => (
                    <div
                        className={styles.imageFrame}
                        key={`${url}-${index}`}
                        style={{ "--media-frame-ratio": imageRatios[url] ?? frameAspectRatio } as CSSProperties}
                    >
                        {variant === "question" ? (
                            <button
                                type="button"
                                className={styles.questionImageButton}
                                aria-label={`Open ${altBase} ${index + 1} full size`}
                                title="Click to view full size"
                                onClick={(event) => {
                                    triggerButtonRef.current = event.currentTarget;
                                    setLightboxIndex(index);
                                }}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={optimizeImageDelivery(url)}
                                    alt={`${altBase} ${index + 1}`}
                                    className={styles.image}
                                    loading="lazy"
                                    decoding="async"
                                    referrerPolicy="no-referrer"
                                    onLoad={(event) => handleImageLoad(url, event.currentTarget)}
                                />
                            </button>
                        ) : (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                                src={optimizeImageDelivery(url)}
                                alt={`${altBase} ${index + 1}`}
                                className={styles.image}
                                loading="lazy"
                                decoding="async"
                                referrerPolicy="no-referrer"
                                onLoad={(event) => handleImageLoad(url, event.currentTarget)}
                            />
                        )}
                    </div>
                ))}
            </div>
            {variant === "question" && lightboxUrl && typeof document !== "undefined"
                ? createPortal(
                    <div
                        className={styles.lightboxBackdrop}
                    >
                        <div
                            className={styles.lightboxDialog}
                            role="dialog"
                            aria-modal="true"
                            aria-label={`${altBase} enlarged`}
                        >
                            <button
                                ref={closeButtonRef}
                                type="button"
                                className={styles.lightboxClose}
                                aria-label="Close enlarged image"
                                onClick={() => setLightboxIndex(null)}
                            >
                                ×
                            </button>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={optimizeImageDelivery(lightboxUrl)}
                                alt={`${altBase} ${(lightboxIndex ?? 0) + 1}`}
                                className={styles.lightboxImage}
                                loading="eager"
                                decoding="async"
                                referrerPolicy="no-referrer"
                            />
                        </div>
                    </div>,
                    document.body,
                )
                : null}
        </>
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
