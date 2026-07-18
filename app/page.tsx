import ExperienceLoader from "@/app/_experience/ExperienceLoader";
import { Mark } from "@/app/components/Mark";
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
        <h1>Stratxcel — the operating system for modern business</h1>
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
        className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-[#05070e] px-6"
      >
        <p className="sx-kicker">an interactive experience</p>
        <div className="mt-8">
          <Mark className="h-16 w-16 sm:h-20 sm:w-20" />
        </div>
        <p
          aria-hidden="true"
          className="sx-display sx-glow-text mt-8 text-center text-[clamp(2.6rem,7vw,5.5rem)] text-white"
        >
          Stratxcel
        </p>
        <p className="mt-4 max-w-md text-center text-[clamp(0.95rem,1.8vw,1.15rem)] font-light text-slate-400">
          We don&rsquo;t build websites. We engineer businesses.
        </p>
        <button
          type="button"
          disabled
          className="sx-start-pulse mt-12 rounded-full border border-[#45c4ff]/50 bg-[#45c4ff]/[0.06] px-10 py-4 font-mono text-sm tracking-[0.45em] text-white"
        >
          PRESS&nbsp;START
        </button>
        <p className="mt-6 font-mono text-[10px] tracking-[0.3em] text-slate-600">
          LOADING…
        </p>
      </div>
      <ExperienceLoader />
    </>
  );
}
