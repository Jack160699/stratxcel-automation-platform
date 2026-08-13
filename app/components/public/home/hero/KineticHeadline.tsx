"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";
import {
  HERO_PHRASE_INTERVAL_MS,
  HERO_PHRASE_REDUCED_MOTION,
  HERO_PHRASES,
  type HeroSceneKey,
} from "./hero-phrases";

const EXIT_MS = 420;
const ENTER_MS = 520;

type KineticHeadlineProps = {
  onSceneChange?: (scene: HeroSceneKey) => void;
  paused?: boolean;
};

/**
 * Outcome phrases resolve in place — a small vertical settle plus a focus
 * transition. Deliberately not a typewriter, letter reveal, or slot machine.
 */
export function KineticHeadline({ onSceneChange, paused = false }: KineticHeadlineProps) {
  const staticMode = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"idle" | "exit" | "enter">("idle");
  const timers = useRef<number[]>([]);

  const activeIndex = staticMode ? HERO_PHRASES.indexOf(HERO_PHRASE_REDUCED_MOTION) : index;
  const phrase = HERO_PHRASES[activeIndex >= 0 ? activeIndex : 0]!;

  const clearTimers = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }, []);

  // Keeps the workspace in step with the phrase, including the reduced-motion
  // resolve where prefers-reduced-motion only becomes known after hydration.
  useEffect(() => {
    onSceneChange?.(phrase.scene);
  }, [onSceneChange, phrase.scene]);

  useEffect(() => {
    if (staticMode || paused) return;

    const advance = () => {
      setPhase("exit");
      timers.current.push(
        window.setTimeout(() => {
          setIndex((i) => {
            const next = (i + 1) % HERO_PHRASES.length;
            onSceneChange?.(HERO_PHRASES[next]!.scene);
            return next;
          });
          setPhase("enter");
          timers.current.push(window.setTimeout(() => setPhase("idle"), ENTER_MS));
        }, EXIT_MS),
      );
    };

    const interval = window.setInterval(advance, HERO_PHRASE_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
      clearTimers();
    };
  }, [staticMode, paused, onSceneChange, clearTimers]);

  const motionClass = phase === "exit" ? "sx-kinetic-exit" : phase === "enter" ? "sx-kinetic-enter" : "sx-kinetic-idle";

  return (
    <span className="relative block">
      {/* The lead-in already sits in the h1, so only the outcome is announced. */}
      <span className="sr-only">{phrase.text}</span>
      <span aria-hidden className="relative block" style={{ minHeight: "1.15em" }}>
        <span
          key={`${phrase.text}-${activeIndex}`}
          className={`block bg-gradient-to-br from-white via-white to-[#a8c7ff] bg-clip-text text-transparent ${
            staticMode ? "" : motionClass
          }`}
        >
          {phrase.text}
        </span>
      </span>
    </span>
  );
}
