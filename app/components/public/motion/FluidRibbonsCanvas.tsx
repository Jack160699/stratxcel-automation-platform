"use client";

import React, { useEffect, useRef } from "react";

export type OutcomeType =
  | "MORE TIME"
  | "LOWER COSTS"
  | "BETTER QUALITY"
  | "MORE CUSTOMERS"
  | "BETTER FOLLOW-UPS"
  | "MORE SALES"
  | "FASTER GROWTH";

interface FluidRibbonsCanvasProps {
  activeOutcome?: OutcomeType;
  className?: string;
}

interface DiagonalBand {
  baseOffsetRatio: number; // Position across perpendicular axis (0 to 1)
  width: number;           // Band width in px
  speed: number;           // Drift speed in px/ms (~25-45s per cycle)
  opacity: number;         // Max opacity (0.06 - 0.16)
  colorType: "cyanLight" | "paleCobalt" | "softIce" | "deepAccent";
}

// 7 broad diagonal translucent light bands moving smoothly in harmony
const BANDS: DiagonalBand[] = [
  {
    baseOffsetRatio: -0.15,
    width: 280,
    speed: 0.000022, // ~45s cycle
    opacity: 0.14,
    colorType: "paleCobalt",
  },
  {
    baseOffsetRatio: 0.08,
    width: 220,
    speed: 0.000028, // ~35s cycle
    opacity: 0.18,
    colorType: "cyanLight",
  },
  {
    baseOffsetRatio: 0.28,
    width: 320,
    speed: 0.000018, // ~55s cycle
    opacity: 0.12,
    colorType: "softIce",
  },
  {
    baseOffsetRatio: 0.52,
    width: 240,
    speed: 0.000032, // ~30s cycle
    opacity: 0.15,
    colorType: "paleCobalt",
  },
  {
    baseOffsetRatio: 0.72,
    width: 300,
    speed: 0.000024, // ~42s cycle
    opacity: 0.14,
    colorType: "cyanLight",
  },
  {
    baseOffsetRatio: 0.95,
    width: 260,
    speed: 0.000020, // ~50s cycle
    opacity: 0.13,
    colorType: "softIce",
  },
  {
    baseOffsetRatio: 1.18,
    width: 340,
    speed: 0.000026, // ~38s cycle
    opacity: 0.11,
    colorType: "deepAccent",
  },
];

export function FluidRibbonsCanvas({
  activeOutcome = "MORE TIME",
  className = "",
}: FluidRibbonsCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;

    // Check prefers-reduced-motion
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let prefersReducedMotion = mediaQuery.matches;

    const handleMotionPreference = (e: MediaQueryListEvent) => {
      prefersReducedMotion = e.matches;
      if (prefersReducedMotion) {
        cancelAnimationFrame(animationFrameId);
        drawStaticFrame();
      } else {
        animationFrameId = requestAnimationFrame(render);
      }
    };
    mediaQuery.addEventListener("change", handleMotionPreference);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      // Cap devicePixelRatio at 1.5 to maximize performance and smoothness
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.scale(dpr, dpr);

      if (prefersReducedMotion) {
        drawStaticFrame();
      }
    };

    resize();
    window.addEventListener("resize", resize);

    // Draw one subtle atmospheric static frame for reduced motion
    const drawStaticFrame = () => {
      if (!ctx || width === 0 || height === 0) return;
      ctx.clearRect(0, 0, width, height);

      // Soft top-to-bottom atmospheric wash
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      bgGrad.addColorStop(0, "rgba(248, 251, 255, 0.8)");
      bgGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.95)");
      bgGrad.addColorStop(1, "rgba(255, 255, 255, 1)");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);
    };

    // Diagonal angle: ~-27 degrees (matching Razorpay-style flowing light sheets)
    const angle = (-27 * Math.PI) / 180;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    const render = (timestamp: number) => {
      ctx.clearRect(0, 0, width, height);

      // 1. Base soft luminous background wash
      const baseGrad = ctx.createLinearGradient(0, 0, width, height);
      baseGrad.addColorStop(0, "rgba(240, 247, 255, 0.45)");
      baseGrad.addColorStop(0.4, "rgba(255, 255, 255, 0.2)");
      baseGrad.addColorStop(1, "rgba(255, 255, 255, 1)");
      ctx.fillStyle = baseGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Ambient top-left soft glow
      const ambientGlow = ctx.createRadialGradient(
        width * 0.1,
        height * 0.15,
        20,
        width * 0.15,
        height * 0.2,
        Math.max(width * 0.6, 500)
      );
      ambientGlow.addColorStop(0, "rgba(219, 234, 254, 0.35)");
      ambientGlow.addColorStop(0.5, "rgba(239, 246, 255, 0.15)");
      ambientGlow.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = ambientGlow;
      ctx.fillRect(0, 0, width, height);

      // 3. Render rotating diagonal translucent bands
      ctx.save();
      // Translate to canvas center and rotate by diagonal angle
      const cx = width * 0.5;
      const cy = height * 0.45;
      ctx.translate(cx, cy);
      ctx.rotate(angle);

      // Diagonal span needed to cover entire rotated canvas
      const diagSpan = Math.sqrt(width * width + height * height) * 1.5;
      const bandLength = diagSpan * 1.6;

      for (let i = 0; i < BANDS.length; i++) {
        const band = BANDS[i];
        // Slow continuous drift across perpendicular axis
        const drift = (timestamp * band.speed * 400) % diagSpan;
        const rawX = -diagSpan * 0.6 + band.baseOffsetRatio * diagSpan + drift;
        // Wrap around smoothly
        const x = ((rawX + diagSpan * 0.5) % diagSpan) - diagSpan * 0.5;

        // Band linear gradient perpendicular to band direction
        const bandGrad = ctx.createLinearGradient(x - band.width * 0.5, 0, x + band.width * 0.5, 0);
        const alpha = band.opacity;

        if (band.colorType === "cyanLight") {
          bandGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
          bandGrad.addColorStop(0.2, `rgba(224, 242, 254, ${alpha * 0.5})`);
          bandGrad.addColorStop(0.5, `rgba(56, 189, 248, ${alpha * 0.85})`);
          bandGrad.addColorStop(0.75, `rgba(186, 230, 253, ${alpha * 0.6})`);
          bandGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
        } else if (band.colorType === "paleCobalt") {
          bandGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
          bandGrad.addColorStop(0.25, `rgba(191, 219, 254, ${alpha * 0.6})`);
          bandGrad.addColorStop(0.55, `rgba(37, 99, 235, ${alpha * 0.7})`);
          bandGrad.addColorStop(0.8, `rgba(147, 197, 253, ${alpha * 0.5})`);
          bandGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
        } else if (band.colorType === "deepAccent") {
          bandGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
          bandGrad.addColorStop(0.3, `rgba(147, 197, 253, ${alpha * 0.5})`);
          bandGrad.addColorStop(0.6, `rgba(29, 78, 216, ${alpha * 0.6})`);
          bandGrad.addColorStop(0.85, `rgba(219, 234, 254, ${alpha * 0.4})`);
          bandGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
        } else {
          bandGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
          bandGrad.addColorStop(0.3, `rgba(239, 246, 255, ${alpha * 0.6})`);
          bandGrad.addColorStop(0.5, `rgba(191, 219, 254, ${alpha * 0.8})`);
          bandGrad.addColorStop(0.7, `rgba(224, 242, 254, ${alpha * 0.5})`);
          bandGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
        }

        ctx.fillStyle = bandGrad;
        ctx.fillRect(x - band.width * 0.5, -bandLength * 0.5, band.width, bandLength);
      }

      ctx.restore();

      // 4. Central Quiet Zone: soft radial mask ensuring text area remains pure white & peaceful
      const qzX = width * 0.5;
      const qzY = height * 0.36;
      const qzRadius = Math.min(width * 0.52, 460);
      const quietMask = ctx.createRadialGradient(
        qzX,
        qzY,
        qzRadius * 0.25,
        qzX,
        qzY,
        qzRadius
      );
      quietMask.addColorStop(0, "rgba(255, 255, 255, 0.72)");
      quietMask.addColorStop(0.55, "rgba(255, 255, 255, 0.45)");
      quietMask.addColorStop(0.85, "rgba(255, 255, 255, 0.15)");
      quietMask.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = quietMask;
      ctx.fillRect(0, 0, width, height);

      // 5. Seamless bottom fade into solid white for Section 02 transition
      const bottomFade = ctx.createLinearGradient(0, height * 0.82, 0, height);
      bottomFade.addColorStop(0, "rgba(255, 255, 255, 0)");
      bottomFade.addColorStop(0.7, "rgba(255, 255, 255, 0.75)");
      bottomFade.addColorStop(1, "rgba(255, 255, 255, 1)");
      ctx.fillStyle = bottomFade;
      ctx.fillRect(0, height * 0.8, width, height * 0.2);

      if (!prefersReducedMotion) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    if (!prefersReducedMotion) {
      animationFrameId = requestAnimationFrame(render);
    } else {
      drawStaticFrame();
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resize);
      mediaQuery.removeEventListener("change", handleMotionPreference);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      aria-hidden="true"
    />
  );
}
