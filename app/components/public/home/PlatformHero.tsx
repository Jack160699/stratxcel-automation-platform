"use client";

import Link from "next/link";
import { useCallback, useState, useSyncExternalStore } from "react";
import { PublicButton } from "@/app/components/public/primitives/PublicButton";
import { HeroCinematicScene } from "./hero/HeroCinematicScene";
import { HeroMediaLayer } from "./hero/HeroMediaLayer";
import { KineticHeadline } from "./hero/KineticHeadline";
import type { HeroSceneKey } from "./hero/hero-phrases";

function subscribeCompact(callback: () => void) {
  const mq = window.matchMedia("(max-width: 639px)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getCompactSnapshot() {
  return window.matchMedia("(max-width: 639px)").matches;
}

function getCompactServerSnapshot() {
  return false;
}

export function PlatformHero() {
  const [scene, setScene] = useState<HeroSceneKey>("search");
  const compact = useSyncExternalStore(subscribeCompact, getCompactSnapshot, getCompactServerSnapshot);

  const handleSceneChange = useCallback((next: HeroSceneKey) => {
    setScene(next);
  }, []);

  return (
    <section
      id="platform-hero"
      data-home-section="platform-hero"
      className="relative isolate min-h-[100svh] overflow-hidden bg-[#06080c] text-white"
    >
      <HeroMediaLayer>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_50%_20%,rgb(37_99_235/0.18),transparent_55%)]" />
        <div className="sx-hero-light-drift absolute -left-[20%] top-[10%] h-[55%] w-[55%] rounded-full bg-[radial-gradient(circle,rgb(58_160_255/0.12),transparent_70%)] blur-3xl" />
        <div className="sx-hero-light-drift-reverse absolute -right-[15%] bottom-[5%] h-[45%] w-[45%] rounded-full bg-[radial-gradient(circle,rgb(79_220_229/0.08),transparent_70%)] blur-3xl" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#06080c] via-[#06080c]/80 to-transparent" />
      </HeroMediaLayer>

      <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-7xl flex-col px-4 pb-28 pt-24 sm:px-6 sm:pb-32 sm:pt-28 lg:px-8 lg:pb-36">
        <div className="grid flex-1 items-center gap-8 sm:gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14 xl:gap-20">
          <div className="mx-auto max-w-xl text-center lg:mx-0 lg:max-w-none lg:text-left">
            <p className="font-sx-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
              Stratxcel
            </p>

            <h1 className="mt-3 font-sx-sans text-[clamp(1.75rem,4.8vw+0.35rem,3.5rem)] font-bold leading-[1.08] tracking-[-0.035em] text-white">
              <span className="block">Stratxcel helps you</span>
              <span className="mt-1 block min-h-[1.2em] text-[clamp(1.75rem,4.8vw+0.35rem,3.5rem)]">
                <KineticHeadline onSceneChange={handleSceneChange} />
              </span>
            </h1>

            <p className="mx-auto mt-4 max-w-md font-sx-sans text-[15px] leading-relaxed text-white/60 sm:mt-5 sm:text-[17px] lg:mx-0">
              One place to market your business, find customers, and get more work done with AI.
            </p>

            <div className="mt-6 flex flex-col items-stretch gap-2.5 sm:mt-8 sm:flex-row sm:items-center sm:justify-center sm:gap-3 lg:justify-start">
              <PublicButton
                href="/products"
                variant="primary"
                className="bg-white text-[#0a1020] shadow-[0_8px_32px_-8px_rgb(255_255_255/0.35)] hover:bg-white/92"
              >
                Explore Stratxcel
              </PublicButton>
              <Link
                href="/how-it-works"
                className="inline-flex min-h-11 items-center justify-center rounded-sx-sm border border-white/15 bg-white/[0.04] px-7 py-3 font-sx-sans text-sm font-semibold text-white/90 transition-colors hover:bg-white/[0.08] motion-reduce:transition-none"
              >
                See How It Works
              </Link>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
            <HeroCinematicScene scene={scene} compact={compact} />
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[min(28vh,14rem)]">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#f7f8fc]/40 to-[#f7f8fc]" />
        <div className="absolute inset-x-0 bottom-0 h-[55%] rounded-t-[2.5rem] bg-[#f7f8fc] shadow-[0_-24px_80px_-20px_rgb(0_0_0/0.25)] sm:rounded-t-[3rem]" />
      </div>
    </section>
  );
}
