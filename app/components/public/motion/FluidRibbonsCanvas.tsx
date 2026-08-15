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

interface RibbonLayer {
  baseYRatio: number; // Vertical position ratio (0 to 1)
  speed: number;      // Rad/ms (extremely slow: 0.00004 - 0.00009)
  amplitude: number;  // Peak displacement in pixels
  frequency: number;  // Spatial wave frequency
  phase: number;      // Initial phase offset
  opacity: number;    // Peak stroke opacity
  lineWidth: number;  // Stroke thickness
  colorScheme: "cobalt" | "paleBlue" | "ambient";
}

const LAYERS: RibbonLayer[] = [
  // Layer 1: Very slow broad pale-blue ribbon flowing across upper/periphery
  {
    baseYRatio: 0.25,
    speed: 0.000045, // ~140s per full cycle
    amplitude: 22,
    frequency: 0.0007,
    phase: 0.0,
    opacity: 0.18,
    lineWidth: 2.5,
    colorScheme: "paleBlue",
  },
  // Layer 2: Slightly slower different-phase pale-cobalt ribbon flowing across lower region
  {
    baseYRatio: 0.72,
    speed: 0.000038, // ~165s per full cycle
    amplitude: 26,
    frequency: 0.0006,
    phase: 2.1,
    opacity: 0.16,
    lineWidth: 2.0,
    colorScheme: "cobalt",
  },
  // Layer 3: Extremely subtle translucent silk wave bridging the background
  {
    baseYRatio: 0.45,
    speed: 0.000032, // ~195s per full cycle
    amplitude: 18,
    frequency: 0.0005,
    phase: 4.3,
    opacity: 0.12,
    lineWidth: 1.8,
    colorScheme: "ambient",
  },
  // Layer 4: Deep ambient drift at the very bottom margin
  {
    baseYRatio: 0.88,
    speed: 0.000028, // ~220s per full cycle
    amplitude: 20,
    frequency: 0.00045,
    phase: 1.4,
    opacity: 0.14,
    lineWidth: 2.0,
    colorScheme: "paleBlue",
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
      // Cap devicePixelRatio at 1.5 to maximize battery life and render performance
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
      bgGrad.addColorStop(0, "rgba(239, 246, 255, 0.4)");
      bgGrad.addColorStop(0.5, "rgba(255, 255, 255, 0)");
      bgGrad.addColorStop(1, "rgba(240, 249, 255, 0.3)");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);
    };

    // Render single silk ribbon wave
    const renderLayer = (layer: RibbonLayer, elapsed: number) => {
      ctx.save();

      const baseY = height * layer.baseYRatio;
      const points: { x: number; y: number }[] = [];
      const step = Math.max(16, Math.floor(width / 50));

      for (let x = 0; x <= width + step; x += step) {
        // Slow single harmonic drift (no sharp high-frequency noise)
        const waveAngle = x * layer.frequency + elapsed * layer.speed + layer.phase;
        const wave1 = Math.sin(waveAngle);
        const wave2 = Math.cos(waveAngle * 0.5 + 1.2) * 0.35;

        // Quiet zone in center: dampen amplitude where text sits
        const normalizedX = x / width; // 0 to 1
        const distFromCenter = Math.abs(normalizedX - 0.5) * 2; // 0 at center, 1 at edges
        // Quiet zone factor: smoother/calmer amplitude near center
        const calmFactor = 0.5 + 0.5 * Math.pow(distFromCenter, 1.4);

        const y = baseY + (wave1 + wave2) * layer.amplitude * calmFactor;
        points.push({ x, y });
      }

      // Draw smooth Catmull-Rom / quadratic curve
      if (points.length > 0) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length - 1; i++) {
          const xc = (points[i].x + points[i + 1].x) / 2;
          const yc = (points[i].y + points[i + 1].y) / 2;
          ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }
        const last = points[points.length - 1];
        ctx.lineTo(last.x, last.y);

        // Stroke gradient (translucent pale cobalt or pale sky blue)
        const strokeGrad = ctx.createLinearGradient(0, 0, width, 0);
        const alpha = layer.opacity;

        if (layer.colorScheme === "cobalt") {
          strokeGrad.addColorStop(0, "rgba(37, 99, 235, 0)");
          strokeGrad.addColorStop(0.2, `rgba(37, 99, 235, ${alpha * 0.7})`);
          strokeGrad.addColorStop(0.5, `rgba(59, 130, 246, ${alpha * 0.4})`); // Quiet center
          strokeGrad.addColorStop(0.8, `rgba(37, 99, 235, ${alpha * 0.8})`);
          strokeGrad.addColorStop(1, "rgba(37, 99, 235, 0)");
        } else if (layer.colorScheme === "paleBlue") {
          strokeGrad.addColorStop(0, "rgba(56, 189, 248, 0)");
          strokeGrad.addColorStop(0.25, `rgba(56, 189, 248, ${alpha * 0.8})`);
          strokeGrad.addColorStop(0.5, `rgba(186, 230, 253, ${alpha * 0.3})`); // Quiet center
          strokeGrad.addColorStop(0.75, `rgba(56, 189, 248, ${alpha * 0.7})`);
          strokeGrad.addColorStop(1, "rgba(56, 189, 248, 0)");
        } else {
          strokeGrad.addColorStop(0, "rgba(147, 197, 253, 0)");
          strokeGrad.addColorStop(0.3, `rgba(147, 197, 253, ${alpha * 0.6})`);
          strokeGrad.addColorStop(0.5, `rgba(224, 242, 254, ${alpha * 0.2})`);
          strokeGrad.addColorStop(0.8, `rgba(147, 197, 253, ${alpha * 0.6})`);
          strokeGrad.addColorStop(1, "rgba(147, 197, 253, 0)");
        }

        ctx.strokeStyle = strokeGrad;
        ctx.lineWidth = layer.lineWidth;
        ctx.lineCap = "round";
        ctx.stroke();

        // Soft subtle fill underneath with quiet-zone radial dampening
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();

        const fillGrad = ctx.createLinearGradient(0, baseY, 0, height);
        fillGrad.addColorStop(0, `rgba(37, 99, 235, ${alpha * 0.025})`);
        fillGrad.addColorStop(0.6, `rgba(56, 189, 248, ${alpha * 0.01})`);
        fillGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = fillGrad;
        ctx.fill();
      }

      ctx.restore();
    };

    const render = (timestamp: number) => {
      ctx.clearRect(0, 0, width, height);

      // Render all 4 layered silk curves
      for (const layer of LAYERS) {
        renderLayer(layer, timestamp);
      }

      // Soft center quiet-zone mask: gentle radial gradient to guarantee crisp text contrast
      const centerX = width * 0.5;
      const centerY = height * 0.38;
      const quietRadius = Math.min(width * 0.45, 420);
      const quietGrad = ctx.createRadialGradient(
        centerX,
        centerY,
        quietRadius * 0.2,
        centerX,
        centerY,
        quietRadius
      );
      quietGrad.addColorStop(0, "rgba(255, 255, 255, 0.45)");
      quietGrad.addColorStop(0.7, "rgba(255, 255, 255, 0.2)");
      quietGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = quietGrad;
      ctx.fillRect(0, 0, width, height);

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
