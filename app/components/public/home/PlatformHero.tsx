"use client";

import Link from "next/link";
import { useCallback, useState, useSyncExternalStore } from "react";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";
import { DEMO_DISCLAIMER } from "@/app/components/public/showcase/fixtures/showcase-data";
import { useInView } from "@/lib/motion/useInView";
import { HeroMediaLayer } from "./hero/HeroMediaLayer";
import { HeroWorkspaceBoard, HeroWorkspaceCard } from "./hero/HeroWorkspaceBoard";
import { KineticHeadline } from "./hero/KineticHeadline";
import type { HeroSceneKey } from "./hero/hero-phrases";

const COMPACT_QUERY = "(max-width: 767px)";

function subscribeCompact(callback: () => void) {
  const mq = window.matchMedia(COMPACT_QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getCompactSnapshot() {
  return window.matchMedia(COMPACT_QUERY).matches;
}

function getCompactServerSnapshot() {
  return false;
}

export function PlatformHero() {
  const [scene, setScene] = useState<HeroSceneKey>("search");
  const compact = useSyncExternalStore(subscribeCompact, getCompactSnapshot, getCompactServerSnapshot);
  const [sectionRef, inView] = useInView<HTMLElement>({ threshold: 0.15, once: false });

  const handleSceneChange = useCallback((next: HeroSceneKey) => setScene(next), []);

  return (
    <section
      ref={sectionRef}
      id="platform-hero"
      data-home-section="platform-hero"
      className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-[#06080c] text-white"
    >
      <HeroMediaLayer>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_85%_60%_at_50%_18%,rgb(37_99_235/0.16),transparent_60%)]" />
        <div className="sx-hero-light-drift absolute -left-[18%] top-[8%] h-[52%] w-[52%] rounded-full bg-[radial-gradient(circle,rgb(58_160_255/0.11),transparent_70%)] blur-3xl" />
        <div className="sx-hero-light-drift-reverse absolute -right-[14%] top-[38%] h-[44%] w-[44%] rounded-full bg-[radial-gradient(circle,rgb(79_220_229/0.07),transparent_70%)] blur-3xl" />
      </HeroMediaLayer>

      <div className="relative z-10 flex flex-1 flex-col px-4 pb-[max(4.5rem,10vh)] pt-24 sm:px-6 sm:pt-26 lg:px-8 lg:pt-28">
        <div className="mx-auto w-full max-w-3xl text-center">
          <p className="font-sx-mono text-[10.5px] font-semibold uppercase tracking-[0.28em] text-white/40">
            Stratxcel
          </p>

          <h1 className="mt-4 font-sx-sans text-[clamp(1.9rem,5.2vw+0.3rem,3.6rem)] font-semibold leading-[1.06] tracking-[-0.035em] text-white">
            <span className="block text-white/70">Stratxcel helps you</span>
            <span className="mt-1.5 block">
              <KineticHeadline onSceneChange={handleSceneChange} paused={!inView} />
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-lg font-sx-sans text-[15px] leading-relaxed text-white/55 sm:text-[17px]">
            One place to market your business, find customers, and get the daily work done — with AI helping and you
            deciding.
          </p>

          <div className="mt-7 flex flex-col items-stretch gap-2.5 sm:mt-9 sm:flex-row sm:items-center sm:justify-center sm:gap-3">
            <TrackedCtaLink
              href="/products"
              event="explore_product"
              surface="home_hero"
              className="inline-flex min-h-11 items-center justify-center rounded-sx-sm bg-white px-7 py-3 font-sx-sans text-sm font-semibold text-[#0a1020] transition-colors hover:bg-white/90 motion-reduce:transition-none"
            >
              Explore Stratxcel
            </TrackedCtaLink>
            <Link
              href="/how-it-works"
              className="inline-flex min-h-11 items-center justify-center rounded-sx-sm border border-white/15 bg-white/[0.04] px-7 py-3 font-sx-sans text-sm font-semibold text-white/85 transition-colors hover:bg-white/[0.09] motion-reduce:transition-none"
            >
              See how it works
            </Link>
          </div>
        </div>

        {compact ? (
          <div className="mt-10 flex flex-1 items-end pb-2">
            <HeroWorkspaceCard scene={scene} />
          </div>
        ) : (
          <div className="relative mt-10 min-h-[17rem] flex-1">
            <HeroWorkspaceBoard scene={scene} />
          </div>
        )}

        {/* Sits above the dawn gradient so the demo-data disclosure stays readable. */}
        <p className="relative z-30 mt-6 text-center font-sx-sans text-[11px] text-white/45">{DEMO_DISCLAIMER}</p>
      </div>

      {/* Dawn transition — the dark environment recedes and the light site rises. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[min(22vh,11rem)]" aria-hidden>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#06080c]/70 to-[#06080c]" />
        <div className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-b from-transparent via-[#f7f8fc]/55 to-[#f7f8fc]" />
        <div className="absolute inset-x-0 bottom-0 h-[26%] bg-[#f7f8fc]" />
      </div>
    </section>
  );
}
