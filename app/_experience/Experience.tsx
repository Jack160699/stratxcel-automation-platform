"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import CanvasStage from "./CanvasStage";
import Cursor from "./Cursor";
import StaticExperience from "./StaticExperience";
import { createJourneyState } from "./journey";
import { SCENES, type SceneId } from "./content";
import {
  Mark,
  SceneAgent,
  SceneCapabilities,
  SceneCases,
  SceneChaos,
  SceneEcosystem,
  SceneExplore,
  SceneIdentity,
} from "./scenes";

gsap.registerPlugin(ScrollTrigger);

const seg = (id: SceneId) => SCENES.find((s) => s.id === id)!;

/** Total scroll track length — the "runtime" of the film. */
const TRACK_VH = 780;

/**
 * One-time client capability probe. Safe outside an effect: this component
 * is loaded with `ssr: false`, so it only ever renders in the browser.
 */
function probeCapabilities() {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let webgl = false;
  try {
    const c = document.createElement("canvas");
    webgl = !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    webgl = false;
  }
  const small = window.innerWidth < 768;
  const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
  return {
    fallback: reduced || !webgl,
    particleCount: small ? 9000 : mem <= 4 ? 14000 : 22000,
  };
}

export default function Experience() {
  const [probe] = useState(probeCapabilities);
  const [fallback, setFallback] = useState(probe.fallback);
  const [started, setStarted] = useState(false);
  const [chapter, setChapter] = useState(SCENES[0].chapter);
  const particleCount = probe.particleCount;

  const journey = useMemo(() => createJourneyState(), []);
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const gateRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const startedRef = useRef(false);
  const chapterRef = useRef(chapter);

  // Journey world: smooth scroll + one master scrubbed timeline.
  useEffect(() => {
    if (fallback) return;
    const root = rootRef.current;
    const track = trackRef.current;
    if (!root || !track) return;

    window.scrollTo(0, 0);
    document.documentElement.style.overflow = "hidden";

    const lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
    lenis.stop();
    lenisRef.current = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    const onPointer = (e: PointerEvent) => {
      journey.pointerX = (e.clientX / window.innerWidth) * 2 - 1;
      journey.pointerY = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    // Ambient: particles condense behind the gate.
    gsap.to(journey, { reveal: 1, duration: 2.2, ease: "power2.out", delay: 0.2 });

    const ctx = gsap.context(() => {
      const scenes = gsap.utils.toArray<HTMLElement>("[data-scene]");
      for (const el of scenes) {
        if (el.dataset.scene !== "identity") gsap.set(el, { autoAlpha: 0 });
      }
      gsap.set("[data-draw]", { strokeDasharray: 1, strokeDashoffset: 1 });
      gsap.set("[data-step]", { opacity: 0.3, x: -6 });
      // identity copy stays hidden until PRESS START triggers its entrance
      gsap.set('[data-scene="identity"] [data-reveal]', { autoAlpha: 0 });

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: track,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.7,
          onUpdate: (self) => {
            journey.progress = self.progress;
            const p = self.progress;
            if (barRef.current) {
              barRef.current.style.transform = `scaleX(${p})`;
            }
            if (hintRef.current) {
              hintRef.current.style.opacity =
                startedRef.current && p < 0.03 ? "1" : "0";
            }
            const scene =
              SCENES.find((s) => p >= s.start && p < s.end) ??
              SCENES[SCENES.length - 1];
            if (scene.chapter !== chapterRef.current) {
              chapterRef.current = scene.chapter;
              setChapter(scene.chapter);
            }
          },
        },
      });

      const byScene = (id: SceneId) =>
        root.querySelector<HTMLElement>(`[data-scene="${id}"]`)!;
      const fadeIn = (el: HTMLElement, at: number, dur = 0.02) =>
        tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: dur }, at);
      const fadeOut = (el: HTMLElement, at: number, dur = 0.02) =>
        tl.to(el, { autoAlpha: 0, duration: dur }, at);

      // ——— 01 Identity (entrance handled at press-start) ———
      const identity = byScene("identity");
      tl.to(identity, { autoAlpha: 0, scale: 0.94, duration: 0.02 }, seg("identity").end - 0.02);

      // ——— 02 Chaos ———
      const chaos = byScene("chaos");
      const c = seg("chaos");
      fadeIn(chaos, c.start);
      tl.fromTo(
        chaos.querySelectorAll("[data-chaos-head]"),
        { autoAlpha: 0, y: 26 },
        { autoAlpha: 1, y: 0, duration: 0.02, stagger: 0.006 },
        c.start + 0.008
      );
      tl.fromTo(
        chaos.querySelectorAll("[data-frag]"),
        { autoAlpha: 0 },
        { autoAlpha: 0.9, duration: 0.015, stagger: 0.0035 },
        c.start + 0.004
      );
      tl.to(
        chaos.querySelectorAll("[data-frag]"),
        {
          transform: "translate(0vw, 0vh) rotate(0deg) scale(0.1)",
          autoAlpha: 0,
          duration: 0.045,
          stagger: 0.0035,
          ease: "power2.in",
        },
        c.start + 0.062
      );
      tl.to(
        chaos.querySelectorAll("[data-chaos-head]"),
        { autoAlpha: 0.12, duration: 0.02 },
        c.start + 0.075
      );
      tl.fromTo(
        chaos.querySelector("[data-chaos-order]"),
        { autoAlpha: 0, scale: 0.92 },
        { autoAlpha: 1, scale: 1, duration: 0.025 },
        c.start + 0.085
      );
      fadeOut(chaos, c.end - 0.018);

      // ——— 03 Capabilities ———
      const capsWrap = byScene("capabilities");
      const cp = seg("capabilities");
      fadeIn(capsWrap, cp.start);
      const caps = gsap.utils.toArray<HTMLElement>("[data-cap]", capsWrap);
      const slot = (cp.end - cp.start) / caps.length;
      caps.forEach((cap, i) => {
        const at = cp.start + i * slot;
        tl.fromTo(
          cap,
          { autoAlpha: 0, y: 34 },
          { autoAlpha: 1, y: 0, duration: 0.009 },
          at + 0.002
        );
        const draws = cap.querySelectorAll("[data-draw]");
        if (draws.length) {
          tl.to(
            draws,
            { strokeDashoffset: 0, duration: 0.018, stagger: 0.0016 },
            at + 0.008
          );
        }
        const reveals = cap.querySelectorAll("[data-reveal]");
        if (reveals.length) {
          tl.fromTo(
            reveals,
            { autoAlpha: 0, y: 10 },
            { autoAlpha: 1, y: 0, duration: 0.008, stagger: 0.003 },
            at + 0.022
          );
        }
        if (i < caps.length - 1) {
          tl.to(cap, { autoAlpha: 0, y: -26, duration: 0.008 }, at + slot - 0.006);
        }
      });
      fadeOut(capsWrap, cp.end - 0.015);

      // ——— 04 Agent ———
      const agent = byScene("agent");
      const a = seg("agent");
      fadeIn(agent, a.start);
      tl.fromTo(
        agent.querySelectorAll("[data-reveal]"),
        { autoAlpha: 0, y: 22 },
        { autoAlpha: 1, y: 0, duration: 0.015, stagger: 0.005 },
        a.start + 0.006
      );
      tl.to(
        agent.querySelector("[data-type]"),
        { clipPath: "inset(0 0% 0 0)", duration: 0.03 },
        a.start + 0.02
      );
      const steps = gsap.utils.toArray<HTMLElement>("[data-step]", agent);
      const stepSpan = (a.end - a.start - 0.07) / steps.length;
      steps.forEach((step, i) => {
        const at = a.start + 0.055 + i * stepSpan;
        tl.to(step, { opacity: 1, x: 0, duration: 0.008 }, at);
        tl.to(
          step.querySelector("[data-step-core]"),
          { opacity: 1, duration: 0.006 },
          at + 0.002
        );
      });
      fadeOut(agent, a.end - 0.015);

      // ——— 05 Case studies ———
      const casesWrap = byScene("cases");
      const cs = seg("cases");
      fadeIn(casesWrap, cs.start);
      const cases = gsap.utils.toArray<HTMLElement>("[data-case]", casesWrap);
      const caseSlot = (cs.end - cs.start) / cases.length;
      cases.forEach((el, i) => {
        const at = cs.start + i * caseSlot;
        tl.fromTo(
          el,
          { autoAlpha: 0, y: 30 },
          { autoAlpha: 1, y: 0, duration: 0.009 },
          at + 0.002
        );
        const counter = el.querySelector("[data-count]");
        if (counter) {
          const to = Number((counter as HTMLElement).dataset.countTo ?? 0);
          tl.fromTo(
            counter,
            { textContent: 0 },
            { textContent: to, snap: { textContent: 1 }, duration: 0.02 },
            at + 0.008
          );
        }
        if (i < cases.length - 1) {
          tl.to(el, { autoAlpha: 0, y: -24, duration: 0.008 }, at + caseSlot - 0.006);
        }
      });
      fadeOut(casesWrap, cs.end - 0.014);

      // ——— 06 Ecosystem ———
      const eco = byScene("ecosystem");
      const e = seg("ecosystem");
      fadeIn(eco, e.start);
      tl.fromTo(
        eco.querySelectorAll("[data-reveal]"),
        { autoAlpha: 0, scale: 0.9 },
        { autoAlpha: 1, scale: 1, duration: 0.012, stagger: 0.0025 },
        e.start + 0.008
      );
      fadeOut(eco, e.end - 0.012);

      // ——— 07 Explore ———
      const explore = byScene("explore");
      const x = seg("explore");
      fadeIn(explore, x.start + 0.004, 0.02);
      tl.fromTo(
        explore.querySelectorAll("[data-reveal]"),
        { autoAlpha: 0, y: 24 },
        { autoAlpha: 1, y: 0, duration: 0.018, stagger: 0.0045 },
        x.start + 0.018
      );
    }, root);

    return () => {
      ctx.revert();
      window.removeEventListener("pointermove", onPointer);
      gsap.ticker.remove(raf);
      lenis.destroy();
      lenisRef.current = null;
      document.documentElement.style.overflow = "";
    };
  }, [fallback, journey]);

  const handleStart = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarted(true);
    document.documentElement.style.overflow = "";
    lenisRef.current?.start();
    ScrollTrigger.refresh();

    const gate = gateRef.current;
    if (gate) {
      gsap.to(gate.querySelectorAll("[data-gate-el]"), {
        autoAlpha: 0,
        y: -26,
        scale: 1.04,
        duration: 0.7,
        stagger: 0.06,
        ease: "power3.in",
      });
      gsap.to(gate, { autoAlpha: 0, duration: 0.9, delay: 0.5, ease: "power2.inOut" });
    }
    // shockwave through the particle field
    gsap.to(journey, { burst: 1, duration: 0.55, ease: "power2.out", delay: 0.15 });
    gsap.to(journey, { burst: 0, duration: 1.6, ease: "power3.out", delay: 0.7 });

    // cinematic entrance of the identity scene
    gsap.fromTo(
      '[data-scene="identity"] [data-reveal]',
      { autoAlpha: 0, y: 34 },
      { autoAlpha: 1, y: 0, duration: 1.1, stagger: 0.2, delay: 0.7, ease: "power3.out" }
    );
    if (hintRef.current) {
      gsap.to(hintRef.current, { opacity: 1, duration: 0.8, delay: 2 });
    }
  }, [journey]);

  const scrollToEnd = useCallback(() => {
    if (!startedRef.current) handleStart();
    lenisRef.current?.scrollTo(document.documentElement.scrollHeight, {
      duration: 3,
      easing: (t: number) => 1 - Math.pow(1 - t, 3),
    });
  }, [handleStart]);

  const replay = useCallback(() => {
    lenisRef.current?.scrollTo(0, {
      duration: 2.2,
      easing: (t: number) => 1 - Math.pow(1 - t, 3),
    });
  }, []);

  if (fallback) return <StaticExperience />;

  return (
    <div ref={rootRef} className="sx-journey">
      {/* scroll track — the film's runtime */}
      <div ref={trackRef} style={{ height: `${TRACK_VH}vh` }} aria-hidden="true" />

      <CanvasStage
        journey={journey}
        count={particleCount}
        onFail={() => setFallback(true)}
      />
      <div className="sx-vignette pointer-events-none fixed inset-0 z-[5]" aria-hidden="true" />
      <div className="sx-grain pointer-events-none fixed inset-0 z-[6] overflow-hidden" aria-hidden="true" />

      {/* scenes */}
      <SceneIdentity />
      <SceneChaos />
      <SceneCapabilities />
      <SceneAgent />
      <SceneCases />
      <SceneEcosystem />
      <SceneExplore onReplay={replay} />

      {/* HUD */}
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <Mark className="h-7 w-7" />
          <span className="font-mono text-[11px] tracking-[0.35em] text-slate-300">
            STRATXCEL
          </span>
        </div>
        {started && (
          <div className="flex items-center gap-5">
            <span className="hidden font-mono text-[10px] tracking-[0.3em] text-slate-500 sm:block">
              {chapter.toUpperCase()}
            </span>
            <button
              type="button"
              onClick={scrollToEnd}
              className="pointer-events-auto font-mono text-[10px] tracking-[0.3em] text-slate-400 transition-colors hover:text-white"
            >
              SKIP ▸
            </button>
          </div>
        )}
      </header>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-40 h-px bg-white/5">
        <div
          ref={barRef}
          className="h-px origin-left bg-gradient-to-r from-[#45c4ff] to-[#8b5cf6]"
          style={{ transform: "scaleX(0)" }}
        />
      </div>

      {/* scroll hint */}
      <div
        ref={hintRef}
        className="pointer-events-none fixed inset-x-0 bottom-8 z-40 flex flex-col items-center gap-2 opacity-0 transition-opacity duration-700"
      >
        <span className="font-mono text-[10px] tracking-[0.4em] text-slate-400">
          SCROLL
        </span>
        <span className="block h-8 w-px overflow-hidden bg-white/10">
          <span
            className="block h-3 w-px bg-[#45c4ff]"
            style={{ animation: "sx-scan 1.6s ease-in-out infinite" }}
          />
        </span>
      </div>

      {/* press start gate */}
      <div
        ref={gateRef}
        className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-transparent px-6 ${
          started ? "pointer-events-none" : ""
        }`}
      >
        <p data-gate-el className="sx-kicker">
          an interactive experience
        </p>
        <div data-gate-el className="mt-8">
          <Mark className="h-16 w-16 sm:h-20 sm:w-20" />
        </div>
        <h1
          data-gate-el
          className="sx-display sx-glow-text mt-8 text-center text-[clamp(2.6rem,7vw,5.5rem)] text-white"
        >
          Stratxcel
        </h1>
        <p
          data-gate-el
          className="mt-4 max-w-md text-center text-[clamp(0.95rem,1.8vw,1.15rem)] font-light text-slate-400"
        >
          We don&rsquo;t build websites. We engineer businesses.
        </p>
        <button
          data-gate-el
          type="button"
          onClick={handleStart}
          autoFocus
          className="sx-start-pulse mt-12 rounded-full border border-[#45c4ff]/50 bg-[#45c4ff]/[0.06] px-10 py-4 font-mono text-sm tracking-[0.45em] text-white transition-all duration-300 hover:border-[#45c4ff] hover:bg-[#45c4ff]/15"
        >
          PRESS&nbsp;START
        </button>
        <button
          data-gate-el
          type="button"
          onClick={scrollToEnd}
          className="mt-6 font-mono text-[10px] tracking-[0.3em] text-slate-500 transition-colors hover:text-slate-200"
        >
          SKIP INTRO ▸
        </button>
      </div>

      <Cursor />
    </div>
  );
}
