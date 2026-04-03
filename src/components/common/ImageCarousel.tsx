"use client";

import { useMemo, useState } from "react";
import { optimizeImageDelivery } from "@/lib/image-delivery";

type ImageCarouselProps = {
    imageUrls: string[];
    altBase: string;
    heightClass?: string;
};

export function ImageCarousel({
    imageUrls,
    altBase,
    heightClass = "h-64 sm:h-80",
}: ImageCarouselProps) {
    const urls = useMemo(
        () => imageUrls.map((x) => x.trim()).filter(Boolean),
        [imageUrls],
    );
    const [index, setIndex] = useState(0);

    if (!urls.length) return null;

    const safeIndex = Math.min(index, urls.length - 1);
    const current = urls[safeIndex];
    const hasMultiple = urls.length > 1;

    return (
        <div className={`relative rounded border p-2 flex items-center justify-center w-full ${heightClass}`} style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={optimizeImageDelivery(current)}
                alt={`${altBase} ${safeIndex + 1}`}
                className="max-w-full max-h-full object-contain"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
            />

            {hasMultiple ? (
                <>
                    <button
                        type="button"
                        className="absolute left-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-8 rounded-full border px-2 text-xs ui-click"
                        style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.45)" }}
                        onClick={() => setIndex((prev) => (prev === 0 ? urls.length - 1 : prev - 1))}
                        aria-label="Previous image"
                    >
                        Prev
                    </button>
                    <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-8 rounded-full border px-2 text-xs ui-click"
                        style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.45)" }}
                        onClick={() => setIndex((prev) => (prev + 1) % urls.length)}
                        aria-label="Next image"
                    >
                        Next
                    </button>
                    <span
                        className="absolute bottom-2 right-2 inline-flex items-center justify-center h-6 rounded-full border px-2 text-[11px]"
                        style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.45)" }}
                    >
                        {safeIndex + 1}/{urls.length}
                    </span>
                </>
            ) : null}
        </div>
    );
}
