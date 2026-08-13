import Link from "next/link";
import { PlatformPreview } from "./PlatformPreview";

const CAPABILITIES = [
  "Market research",
  "Content & publishing",
  "Search & discovery",
  "Lead management",
  "WhatsApp",
  "Campaigns",
  "Performance",
];

export function PlatformHero() {
  return (
    <section
      id="platform-hero"
      data-home-section="platform-hero"
      className="relative overflow-hidden border-b border-sx-border"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[min(52vh,28rem)] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgb(37_99_235/0.09),transparent)]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-7xl px-4 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-14 lg:px-8 lg:pb-20 lg:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12 xl:gap-16">
          <div className="mx-auto max-w-xl text-center lg:mx-0 lg:max-w-none lg:text-left">
            <p className="font-sx-mono text-[11px] font-bold uppercase tracking-[0.2em] text-sx-accent">
              Stratxcel
            </p>
            <h1 className="mt-3 font-sx-sans text-[clamp(1.85rem,5.2vw,3.35rem)] font-extrabold leading-[1.08] tracking-[-0.03em] text-sx-text">
              Your AI Growth Operating System.
            </h1>
            <p className="mx-auto mt-4 max-w-lg font-sx-sans text-[15px] leading-relaxed text-sx-text-muted sm:text-[17px] lg:mx-0">
              Research your market, create content, grow on search, manage leads, and run campaigns — with
              human approval where it matters, from one connected platform.
            </p>

            <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center lg:justify-start">
              <Link
                href="/products"
                className="inline-flex min-h-11 items-center justify-center rounded-sx-sm bg-sx-accent px-7 py-3 font-sx-sans text-sm font-bold text-sx-accent-on shadow-md transition-colors hover:bg-[color:var(--sx-accent-hover)]"
              >
                Explore the Platform
              </Link>
              <Link
                href="/how-it-works"
                className="inline-flex min-h-11 items-center justify-center rounded-sx-sm border border-sx-border-strong bg-sx-surface-1 px-7 py-3 font-sx-sans text-sm font-semibold text-sx-text transition-colors hover:bg-sx-surface-2"
              >
                See How It Works
              </Link>
            </div>

            <ul className="mt-8 flex flex-wrap justify-center gap-2 lg:justify-start">
              {CAPABILITIES.map((cap) => (
                <li
                  key={cap}
                  className="rounded-sx-pill border border-sx-border bg-sx-surface-1 px-3 py-1.5 font-sx-sans text-[11.5px] font-medium text-sx-text-muted"
                >
                  {cap}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
            <PlatformPreview />
          </div>
        </div>
      </div>
    </section>
  );
}
