"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";
import {
  HERO_PHRASE_INTERVAL_MS,
  HERO_PHRASE_REDUCED_MOTION,
  HERO_PHRASES,
  type HeroSceneKey,
} from "./hero-phrases";

type KineticHeadlineProps = {
  onSceneChange?: (scene: HeroSceneKey, index: number) => void;
  paused?: boolean;
};

export function KineticHeadline({ onSceneChange, paused = false }: KineticHeadlineProps) {
  const reduced = useReducedMotion();
  const staticMode = reduced;
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"idle" | "exit" | "enter">("idle");
  const initialSync = useRef(false);

  const activeIndex = staticMode
    ? HERO_PHRASES.findIndex((p) => p.scene === HERO_PHRASE_REDUCED_MOTION.scene)
    : index;
  const phrase = HERO_PHRASES[activeIndex >= 0 ? activeIndex : 0]!;

  const advance = useCallback(() => {
    if (staticMode) return;
    setPhase("exit");
    window.setTimeout(() => {
      setIndex((i) => {
        const next = (i + 1) % HERO_PHRASES.length;
        onSceneChange?.(HERO_PHRASES[next]!.scene, next);
        return next;
      });
      setPhase("enter");
      window.setTimeout(() => setPhase("idle"), 480);
    }, 420);
  }, [staticMode, onSceneChange]);

  useEffect(() => {
    if (initialSync.current) return;
    initialSync.current = true;
    onSceneChange?.(phrase.scene, activeIndex);
  }, [activeIndex, onSceneChange, phrase.scene]);

  useEffect(() => {
    if (staticMode || paused) return;
    const id = window.setInterval(advance, HERO_PHRASE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [staticMode, paused, advance]);

  const motionClass =
    phase === "exit"
      ? "sx-kinetic-exit"
      : phase === "enter"
        ? "sx-kinetic-enter"
        : "sx-kinetic-idle";

  return (
    <span className="relative block">
      <span className="sr-only">
        Stratxcel helps you {phrase.text}
      </span>
      <span
        aria-hidden
        className="relative block overflow-hidden"
        style={{ minHeight: "1.15em" }}
      >
        <span
          key={`${phrase.text}-${activeIndex}`}
          className={`block bg-gradient-to-r from-white via-white to-sx-accent/90 bg-clip-text text-transparent ${staticMode ? "" : motionClass}`}
        >
          {phrase.text}
        </span>
      </span>
    </span>
  );
}
