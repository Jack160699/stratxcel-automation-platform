"use client";

import React, { useEffect, useState, useCallback, useRef, useSyncExternalStore } from "react";
import Image from "next/image";
import { OFFICIAL_LOGO } from "@/lib/brand";
import { GlobeIcon, ShareNodesIcon, UsersGroupIcon, SearchIcon, SparklesIcon } from "../icons/FeatureIcons";

interface CinematicIntroProps {
  onComplete?: () => void;
  forcePlay?: boolean;
}

const FRAMES = [
  {
    id: "frame-1",
    subtitle: "THE DAILY STRUGGLE",
    title: "Running a business takes a lot.",
    icon: "tasks",
    visualDetail: "Inventory, invoices, staff, appointments, supply lines...",
  },
  {
    id: "frame-2",
    subtitle: "DIGITAL PRESENCE",
    title: "Your website needs attention.",
    icon: "website",
    visualDetail: "Outdated copy, slow loading pages, broken links, SEO gaps...",
  },
  {
    id: "frame-3",
    subtitle: "GROWTH & REACH",
    title: "Your marketing needs consistency.",
    icon: "marketing",
    visualDetail: "Weekly content calendars, caption formatting, multi-channel posts...",
  },
  {
    id: "frame-4",
    subtitle: "CUSTOMER PIPELINE",
    title: "Your customers need follow-up.",
    icon: "customers",
    visualDetail: "WhatsApp inquiries, website lead forms, quote requests...",
  },
  {
    id: "frame-5",
    subtitle: "OVERWHELM",
    title: "And there is always something else to do.",
    icon: "chaos",
    visualDetail: "Too many platforms, not enough hours in the day.",
  },
  {
    id: "frame-6",
    subtitle: "A NEW WAY",
    title: "What if you had help with all of it?",
    icon: "clarity",
    visualDetail: "One dedicated assistant for the digital side of your business.",
  },
  {
    id: "frame-7",
    subtitle: "INTRODUCING",
    title: "Meet Stratxcel.",
    icon: "stratxcel",
    visualDetail: "STRATXCEL AI AGENT — Your AI business assistant.",
  },
];

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSnapshot() {
  if (typeof window === "undefined") return false;
  try {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const seen = sessionStorage.getItem("stratxcel_intro_seen");
    return !(prefersReducedMotion || seen === "true");
  } catch {
    return false;
  }
}

function getServerSnapshot() {
  return false;
}

export function CinematicIntro({ onComplete, forcePlay = false }: CinematicIntroProps) {
  const initialShouldPlay = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [userDismissed, setUserDismissed] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const isPlaying = (forcePlay || initialShouldPlay) && !userDismissed;

  const completeIntro = useCallback(() => {
    setIsFadingOut(true);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("stratxcel_intro_seen", "true");
      } catch {
        // Safe fallback
      }
    }
    setTimeout(() => {
      setUserDismissed(true);
      onComplete?.();
    }, 450);
  }, [onComplete]);

  // Auto-advance frames
  useEffect(() => {
    if (!isPlaying || isFadingOut) return;

    // Frame duration: 1.3s for content frames, 1.8s for final frame
    const duration = currentFrame === FRAMES.length - 1 ? 2000 : 1300;

    timerRef.current = setTimeout(() => {
      if (currentFrame < FRAMES.length - 1) {
        setCurrentFrame((prev) => prev + 1);
      } else {
        completeIntro();
      }
    }, duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPlaying, currentFrame, isFadingOut, completeIntro]);

  // Keyboard shortcut: Escape or Space to skip immediately
  useEffect(() => {
    if (!isPlaying) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " ") {
        e.preventDefault();
        completeIntro();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, completeIntro]);

  if (!isPlaying && !isFadingOut) {
    return null;
  }

  const frame = FRAMES[currentFrame];
  const progressPercent = ((currentFrame + 1) / FRAMES.length) * 100;

  return (
    <div
      role="dialog"
      aria-label="Brand introduction"
      aria-modal="true"
      className={`fixed inset-0 z-[100] flex flex-col justify-between bg-[#06080c] text-white transition-opacity duration-500 ease-out select-none ${
        isFadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-[20%] left-1/2 h-[70vw] w-[70vw] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.18),transparent_70%)] blur-3xl" />
        <div className="absolute -bottom-[20%] left-1/2 h-[60vw] w-[60vw] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(58,160,255,0.12),transparent_70%)] blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,#06080c_90%)]" />
      </div>

      {/* Top Bar: Subtle branding & Skip control */}
      <header className="relative z-20 flex h-16 items-center justify-between px-6 sm:px-10">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 relative">
            <Image
              src={OFFICIAL_LOGO.src}
              alt="Stratxcel"
              width={OFFICIAL_LOGO.width}
              height={OFFICIAL_LOGO.height}
              className="object-contain"
              unoptimized
            />
          </div>
          <span className="font-sx-sans text-sm font-semibold tracking-tight text-white/80">
            Stratxcel
          </span>
        </div>

        <button
          type="button"
          onClick={completeIntro}
          className="group inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-4 py-1.5 font-sx-sans text-xs font-medium text-white/80 backdrop-blur-md transition-all hover:border-white/30 hover:bg-white/[0.12] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
        >
          <span>Skip intro</span>
          <span className="transition-transform group-hover:translate-x-0.5" aria-hidden="true">
            →
          </span>
        </button>
      </header>

      {/* Central Narrative Frame */}
      <main className="relative z-20 mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 text-center">
        {/* Visual Metaphor Icon / Stage */}
        <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-3xl border border-sky-400/20 bg-gradient-to-b from-sky-500/15 to-transparent p-4 shadow-[0_0_30px_rgba(37,99,235,0.25)] transition-all duration-300">
          {frame.icon === "tasks" && (
            <div className="space-y-1.5 w-full">
              <div className="h-2 w-3/4 bg-sky-400/70 rounded" />
              <div className="h-2 w-full bg-white/40 rounded" />
              <div className="h-2 w-1/2 bg-white/25 rounded" />
            </div>
          )}
          {frame.icon === "website" && <GlobeIcon className="w-12 h-12 text-sky-400" />}
          {frame.icon === "marketing" && <ShareNodesIcon className="w-12 h-12 text-sky-400" />}
          {frame.icon === "customers" && <UsersGroupIcon className="w-12 h-12 text-sky-400" />}
          {frame.icon === "chaos" && (
            <div className="relative w-full h-full flex items-center justify-center">
              <span className="absolute -top-1 -left-1 h-3 w-3 rounded-full bg-red-400/60 animate-ping" />
              <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-amber-400/60 animate-ping" />
              <SearchIcon className="w-10 h-10 text-white/70" />
            </div>
          )}
          {frame.icon === "clarity" && <SparklesIcon className="w-12 h-12 text-sky-300 animate-pulse" />}
          {frame.icon === "stratxcel" && (
            <div className="relative h-14 w-14">
              <Image
                src={OFFICIAL_LOGO.src}
                alt="Stratxcel AI Agent"
                width={OFFICIAL_LOGO.width}
                height={OFFICIAL_LOGO.height}
                className="object-contain drop-shadow-[0_0_16px_rgba(58,160,255,0.8)]"
                unoptimized
              />
            </div>
          )}
        </div>

        {/* Subtitle / Kicker */}
        <p className="font-sx-mono text-xs font-semibold uppercase tracking-[0.24em] text-sky-400">
          {frame.subtitle}
        </p>

        {/* Main Thought Heading */}
        <h1
          key={frame.title}
          className="mt-4 font-sx-sans text-[clamp(2rem,5.5vw,3.6rem)] font-bold tracking-tight text-white leading-tight animate-fade-in"
        >
          {frame.title}
        </h1>

        {/* Descriptive Line */}
        <p className="mt-4 max-w-xl font-sx-sans text-sm sm:text-base leading-relaxed text-white/60">
          {frame.visualDetail}
        </p>
      </main>

      {/* Bottom Progress & Frame Navigation */}
      <footer className="relative z-20 pb-8 px-6 sm:px-10">
        <div className="mx-auto max-w-md">
          <div className="flex items-center justify-between text-[11px] font-sx-mono text-white/40 mb-2">
            <span>{currentFrame + 1} of {FRAMES.length}</span>
            <span>Press Esc to enter</span>
          </div>

          <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-sky-400 transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </footer>
    </div>
  );
}
