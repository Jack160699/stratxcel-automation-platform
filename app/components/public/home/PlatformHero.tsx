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

      <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-6 sm:px-6 sm:pb-14 sm:pt-10 lg:px-8 lg:pb-20 lg:pt-16">
        <div className="grid items-center gap-6 sm:gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12 xl:gap-16">
          <div className="mx-auto max-w-xl text-center lg:mx-0 lg:max-w-none lg:text-left">
            <p className="font-sx-mono text-[11px] font-bold uppercase tracking-[0.2em] text-sx-accent">
              Stratxcel
            </p>
            <h1 className="mt-2 font-sx-sans text-[clamp(1.55rem,4.2vw+0.4rem,3.35rem)] font-extrabold leading-[1.1] tracking-[-0.03em] text-sx-text sm:mt-3">
              Your AI Growth Operating System.
            </h1>
            <p className="mx-auto mt-3 max-w-lg font-sx-sans text-[14px] leading-relaxed text-sx-text-muted sm:mt-4 sm:text-[16px] lg:mx-0 lg:text-[17px]">
              Research your market, create content, grow on search, manage leads, and run campaigns — with human
              approval where it matters, from one connected platform.
            </p>

            <div className="mt-5 flex flex-col items-stretch gap-2.5 sm:mt-6 sm:flex-row sm:items-center sm:justify-center sm:gap-3 lg:justify-start">
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

            <ul className="mt-5 hidden flex-wrap justify-center gap-2 sm:mt-6 sm:flex lg:justify-start">
              {CAPABILITIES.map((cap) => (
                <li
                  key={cap}
                  className="rounded-sx-pill border border-sx-border bg-sx-surface-1 px-2.5 py-1 font-sx-sans text-[11px] font-medium text-sx-text-muted sm:px-3 sm:py-1.5 sm:text-[11.5px]"
                >
                  {cap}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
            <div className="motion-safe:animate-sx-float">
              <PlatformPreview />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
