import ExperienceLoader from "@/app/_experience/ExperienceLoader";
import { Mark } from "@/app/components/Mark";
import Link from "next/link";
import {
  AGENT_STEPS,
  CAPABILITIES,
  CASE_STUDIES,
  EXPLORE_LINKS,
} from "@/app/_experience/content";

/**
 * The home route is a cinematic interactive experience (client-only WebGL).
 * This server component ships a crawlable, screen-reader-friendly version of
 * the same narrative underneath it.
 */
export default function HomePage() {
  return (
    <>
      <div className="sr-only">
        <h1>Stratxcel — the AI operating system for modern business</h1>
        <p>
          We don&rsquo;t build websites. We engineer businesses. Stratxcel collapses
          disconnected software, missed leads and manual work into one
          connected, intelligent system.
        </p>
        <h2>Capabilities</h2>
        <ul>
          {CAPABILITIES.map((c) => (
            <li key={c.key}>
              {c.title} — {c.line}
            </li>
          ))}
        </ul>
        <h2>What a Stratxcel agent does</h2>
        <ol>
          {AGENT_STEPS.map((s) => (
            <li key={s.label}>
              {s.label}: {s.detail}
            </li>
          ))}
        </ol>
        <h2>Results</h2>
        <ul>
          {CASE_STUDIES.map((cs) => (
            <li key={cs.client}>
              {cs.client}: {cs.problem} {cs.transformation} Result:{" "}
              {cs.metric.value}
              {cs.metric.suffix} {cs.metric.label}.
            </li>
          ))}
        </ul>
        <h2>Explore</h2>
        <ul>
          {EXPLORE_LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href}>{l.label}</a> — {l.hint}
            </li>
          ))}
        </ul>
      </div>

      {/* Server-rendered gate shell: instant first paint. The client
          experience removes it the moment it mounts and takes over. */}
      <div
        id="sx-static-gate"
        className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-[#05070e] px-6 text-white"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/30 via-[#05070e]/80 to-[#05070e] pointer-events-none" />
        
        <p className="sx-kicker relative z-10 text-xs font-mono tracking-[0.4em] uppercase text-indigo-400">
          AI Business Operating System
        </p>
        <div className="mt-8 relative z-10">
          <Mark className="h-16 w-16 sm:h-20 sm:w-20" />
        </div>
        <p
          aria-hidden="true"
          className="sx-display sx-glow-text mt-8 text-center text-[clamp(2.6rem,7vw,5.5rem)] font-extrabold text-white relative z-10 tracking-tight"
        >
          Stratxcel
        </p>
        <p className="mt-4 max-w-md text-center text-[clamp(0.95rem,1.8vw,1.15rem)] font-light text-slate-300 relative z-10">
          We don&rsquo;t build agency brochures. We engineer automated business growth systems.
        </p>

        {/* Quick Commercial Action CTAs */}
        <div className="mt-8 relative z-10 flex flex-wrap justify-center gap-4">
          <Link
            href="/audit"
            className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-8 py-3 font-mono text-xs font-bold uppercase tracking-widest text-white shadow-[0_0_30px_rgba(99,102,241,0.4)] transition-transform hover:scale-105"
          >
            Book Audit ₹999
          </Link>
          <Link
            href="/pricing"
            className="rounded-full border border-slate-700 bg-slate-900/60 px-8 py-3 font-mono text-xs font-bold uppercase tracking-widest text-slate-200 transition-colors hover:bg-slate-800"
          >
            View Plans
          </Link>
        </div>

        <button
          type="button"
          disabled
          className="sx-start-pulse mt-8 rounded-full border border-[#45c4ff]/50 bg-[#45c4ff]/[0.06] px-10 py-3.5 font-mono text-xs tracking-[0.45em] text-white relative z-10"
        >
          PRESS&nbsp;START
        </button>
        <p className="mt-4 font-mono text-[10px] tracking-[0.3em] text-slate-500 relative z-10">
          INITIALIZING OS ENVIRONMENT…
        </p>
      </div>

      <ExperienceLoader />
    </>
  );
}
