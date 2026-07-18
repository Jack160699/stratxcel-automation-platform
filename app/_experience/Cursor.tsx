"use client";

import { useEffect, useRef } from "react";

/**
 * Custom cursor: a hot dot with a trailing ring that swells over anything
 * interactive. Renders nothing on touch devices.
 */
export default function Cursor() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    const d = dot.current;
    const r = ring.current;
    if (!d || !r) return;

    let x = innerWidth / 2;
    let y = innerHeight / 2;
    let rx = x;
    let ry = y;
    let scale = 1;
    let targetScale = 1;
    let visible = false;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!visible) {
        visible = true;
        d.style.opacity = "1";
        r.style.opacity = "1";
      }
      const el = e.target as Element | null;
      targetScale = el?.closest(
        "a, button, input, textarea, select, label, [data-cursor='hover']"
      )
        ? 2.6
        : 1;
    };

    const onLeave = () => {
      visible = false;
      d.style.opacity = "0";
      r.style.opacity = "0";
    };

    const onDown = () => {
      targetScale = 0.7;
    };
    const onUp = () => {
      targetScale = 1;
    };

    const tick = () => {
      rx += (x - rx) * 0.16;
      ry += (y - ry) * 0.16;
      scale += (targetScale - scale) * 0.18;
      d.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      r.style.transform = `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%) scale(${scale})`;
      raf = requestAnimationFrame(tick);
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("pointerup", onUp);
    document.documentElement.addEventListener("pointerleave", onLeave);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerup", onUp);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div aria-hidden="true" className="hidden [@media(pointer:fine)]:block">
      <div
        ref={dot}
        className="pointer-events-none fixed left-0 top-0 z-[120] h-1.5 w-1.5 rounded-full bg-[#45c4ff] opacity-0 shadow-[0_0_12px_rgba(69,196,255,0.9)] transition-opacity duration-300"
      />
      <div
        ref={ring}
        className="pointer-events-none fixed left-0 top-0 z-[119] h-8 w-8 rounded-full border border-[#45c4ff]/40 opacity-0 transition-opacity duration-300"
      />
    </div>
  );
}
