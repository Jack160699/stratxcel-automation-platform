import ExperienceLoader from "@/app/_experience/ExperienceLoader";
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
      <ExperienceLoader />
    </>
  );
}
