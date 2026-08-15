"use client";

import React, { useEffect, useRef } from "react";

export type OutcomeType =
  | "TIME"
  | "COST"
  | "QUALITY"
  | "CUSTOMERS"
  | "FOLLOW-UPS"
  | "SALES"
  | "GROWTH";

interface FluidRibbonsCanvasProps {
  activeOutcome?: OutcomeType;
  className?: string;
}

interface RibbonParam {
  speed: number;
  count: number;
  amplitude: number;
  frequency: number;
  opacity: number;
  convergence: number;
}

const OUTCOME_PARAMS: Record<OutcomeType, RibbonParam> = {
  TIME: {
    speed: 0.0006,
    count: 4,
    amplitude: 45,
    frequency: 0.0015,
    opacity: 0.28,
    convergence: 0,
  },
  COST: {
    speed: 0.0009,
    count: 5,
    amplitude: 38,
    frequency: 0.0022,
    opacity: 0.32,
    convergence: 0.1,
  },
  QUALITY: {
    speed: 0.0007,
    count: 4,
    amplitude: 35,
    frequency: 0.0018,
    opacity: 0.35,
    convergence: 0,
  },
  CUSTOMERS: {
    speed: 0.0008,
    count: 5,
    amplitude: 42,
    frequency: 0.0019,
    opacity: 0.3,
    convergence: 0.35,
  },
  "FOLLOW-UPS": {
    speed: 0.001,
    count: 4,
    amplitude: 40,
    frequency: 0.0024,
    opacity: 0.3,
    convergence: 0.15,
  },
  SALES: {
    speed: 0.0011,
    count: 5,
    amplitude: 48,
    frequency: 0.002,
    opacity: 0.34,
    convergence: 0.2,
  },
  GROWTH: {
    speed: 0.0012,
    count: 6,
    amplitude: 55,
    frequency: 0.0016,
    opacity: 0.36,
    convergence: 0.25,
  },
};

export function FluidRibbonsCanvas({
  activeOutcome = "TIME",
  className = "",
}: FluidRibbonsCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const targetParamsRef = useRef<RibbonParam>(OUTCOME_PARAMS[activeOutcome] || OUTCOME_PARAMS.TIME);
  const currentParamsRef = useRef<RibbonParam>({ ...(OUTCOME_PARAMS[activeOutcome] || OUTCOME_PARAMS.TIME) });

  useEffect(() => {
    targetParamsRef.current = OUTCOME_PARAMS[activeOutcome] || OUTCOME_PARAMS.TIME;
  }, [activeOutcome]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;
    let time = 0;

    // Check prefers-reduced-motion
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let prefersReducedMotion = mediaQuery.matches;

    const handleMotionPreference = (e: MediaQueryListEvent) => {
      prefersReducedMotion = e.matches;
    };
    mediaQuery.addEventListener("change", handleMotionPreference);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener("resize", resize);

    const lerp = (start: number, end: number, factor: number) =>
      start + (end - start) * factor;

    const drawRibbon = (
      index: number,
      total: number,
      current: RibbonParam,
      elapsed: number
    ) => {
      ctx.save();

      // Ribbon baseline Y offset
      const ySpacing = height / (total + 1.5);
      const baseY = ySpacing * (index + 0.8);
      const phaseOffset = index * 0.95;

      ctx.beginPath();

      const points: { x: number; y: number }[] = [];
      const step = Math.max(12, Math.floor(width / 60));

      for (let x = 0; x <= width; x += step) {
        // Multi-sine harmonic wave
        const normalizedX = x / width;
        const centerWeight = Math.sin(normalizedX * Math.PI); // stronger in middle

        const wave1 = Math.sin(
          x * current.frequency + elapsed * current.speed * 1000 + phaseOffset
        );
        const wave2 = Math.cos(
          x * (current.frequency * 1.6) - elapsed * (current.speed * 600) + phaseOffset * 1.3
        );
        const wave3 = Math.sin(
          x * (current.frequency * 0.6) + elapsed * (current.speed * 400)
        );

        // Convergence effect: pull slightly towards vertical center
        const centerY = height * 0.45;
        const targetY = lerp(baseY, centerY, current.convergence * centerWeight);

        const y =
          targetY +
          (wave1 * current.amplitude * 0.65 +
            wave2 * (current.amplitude * 0.35) +
            wave3 * (current.amplitude * 0.25)) *
            centerWeight;

        points.push({ x, y });
      }

      if (points.length > 0) {
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length - 1; i++) {
          const xc = (points[i].x + points[i + 1].x) / 2;
          const yc = (points[i].y + points[i + 1].y) / 2;
          ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }
        const last = points[points.length - 1];
        ctx.lineTo(last.x, last.y);
      }

      // Elegant gradient ribbon: Translucent cobalt blue (#2563eb) -> cyan/pale blue (#38bdf8 / #e0f2fe)
      const gradient = ctx.createLinearGradient(0, baseY - 60, width, baseY + 60);
      const alpha = current.opacity * (1 - index * 0.08);

      if (index % 2 === 0) {
        gradient.addColorStop(0, `rgba(37, 99, 235, 0)`);
        gradient.addColorStop(0.25, `rgba(37, 99, 235, ${alpha * 0.8})`);
        gradient.addColorStop(0.55, `rgba(56, 189, 248, ${alpha})`);
        gradient.addColorStop(0.85, `rgba(147, 197, 253, ${alpha * 0.7})`);
        gradient.addColorStop(1, `rgba(224, 242, 254, 0)`);
      } else {
        gradient.addColorStop(0, `rgba(59, 130, 246, 0)`);
        gradient.addColorStop(0.3, `rgba(147, 197, 253, ${alpha * 0.6})`);
        gradient.addColorStop(0.65, `rgba(37, 99, 235, ${alpha * 0.85})`);
        gradient.addColorStop(0.9, `rgba(56, 189, 248, ${alpha * 0.5})`);
        gradient.addColorStop(1, `rgba(255, 255, 255, 0)`);
      }

      ctx.strokeStyle = gradient;
      ctx.lineWidth = index === 0 ? 3 : index === 1 ? 2.5 : 2;
      ctx.lineCap = "round";
      ctx.stroke();

      // Soft fill under ribbon for atmospheric depth
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();

      const fillGradient = ctx.createLinearGradient(0, baseY, 0, height);
      fillGradient.addColorStop(0, `rgba(37, 99, 235, ${alpha * 0.07})`);
      fillGradient.addColorStop(0.6, `rgba(56, 189, 248, ${alpha * 0.02})`);
      fillGradient.addColorStop(1, `rgba(255, 255, 255, 0)`);
      ctx.fillStyle = fillGradient;
      ctx.fill();

      ctx.restore();
    };

    const render = (timestamp: number) => {
      time = timestamp;
      ctx.clearRect(0, 0, width, height);

      // Smoothly interpolate current parameters towards target outcome
      const curr = currentParamsRef.current;
      const targ = targetParamsRef.current;
      const lerpSpeed = 0.04;

      curr.speed = lerp(curr.speed, targ.speed, lerpSpeed);
      curr.amplitude = lerp(curr.amplitude, targ.amplitude, lerpSpeed);
      curr.frequency = lerp(curr.frequency, targ.frequency, lerpSpeed);
      curr.opacity = lerp(curr.opacity, targ.opacity, lerpSpeed);
      curr.convergence = lerp(curr.convergence, targ.convergence, lerpSpeed);
      curr.count = targ.count;

      const ribbonCount = Math.round(curr.count);
      for (let i = 0; i < ribbonCount; i++) {
        drawRibbon(i, ribbonCount, curr, prefersReducedMotion ? 1000 : time);
      }

      if (!prefersReducedMotion) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    animationFrameId = requestAnimationFrame(render);

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
