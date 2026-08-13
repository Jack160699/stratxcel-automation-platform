"use client";

import { useCallback, useRef, type CSSProperties } from "react";
import { useReducedMotion } from "./useReducedMotion";

type TiltStyle = CSSProperties & {
  transform?: string;
  transition?: string;
};

const MAX_TILT = 5;

/** Subtle pointer-driven 3D tilt for desktop hero visuals. */
export function useTilt(enabled = true): {
  ref: React.RefObject<HTMLDivElement | null>;
  style: TiltStyle;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerLeave: () => void;
} {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const active = enabled && !reduced;

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!active || !ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      ref.current.style.transform = `perspective(1200px) rotateX(${-y * MAX_TILT}deg) rotateY(${x * MAX_TILT}deg)`;
    },
    [active],
  );

  const onPointerLeave = useCallback(() => {
    if (!active || !ref.current) return;
    ref.current.style.transform = "perspective(1200px) rotateX(0deg) rotateY(0deg)";
  }, [active]);

  const style: TiltStyle = active
    ? { transformStyle: "preserve-3d", transition: "transform 0.35s ease-out" }
    : {};

  return { ref, style, onPointerMove, onPointerLeave };
}
