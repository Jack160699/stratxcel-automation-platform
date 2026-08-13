"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useInView } from "@/lib/motion/useInView";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";

type HeroMediaLayerProps = {
  children: ReactNode;
  /** Future: swap composition for optimized loop video without changing hero layout. */
  mediaKind?: "composition" | "video";
  videoSrc?: string;
  posterSrc?: string;
  className?: string;
};

/**
 * Background media shell for the cinematic hero.
 * Today: CSS/SVG composition. Later: drop in WebM/MP4 via mediaKind="video".
 */
export function HeroMediaLayer({
  children,
  mediaKind = "composition",
  videoSrc,
  posterSrc,
  className = "",
}: HeroMediaLayerProps) {
  const [containerRef, inView] = useInView<HTMLDivElement>({ threshold: 0.05, once: false });
  const reduced = useReducedMotion();
  const paused = reduced || !inView;

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden ${className}`}
      data-hero-media={mediaKind}
      data-hero-paused={paused || undefined}
      aria-hidden
    >
      {mediaKind === "video" && videoSrc ? (
        <video
          className="absolute inset-0 h-full w-full object-cover opacity-80"
          autoPlay
          muted
          loop
          playsInline
          poster={posterSrc}
          preload="none"
        >
          <source src={videoSrc} type="video/webm" />
        </video>
      ) : null}

      <div
        className={`absolute inset-0 ${paused ? "sx-hero-paused" : "motion-safe:sx-hero-alive"}`}
      >
        {children}
      </div>

      <div className="sx-hero-vignette pointer-events-none absolute inset-0" aria-hidden />
      <div className="sx-hero-grain pointer-events-none absolute inset-0 opacity-[0.04]" aria-hidden />
    </div>
  );
}
