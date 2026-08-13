import Link from "next/link";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";

/** Brand bookend — the page opened dark and closes dark, deliberately. */
export function HomeFinalCta() {
  return (
    <section data-home-section="final-cta" className="relative isolate overflow-hidden bg-[#06080c] text-white">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_50%_120%,rgb(37_99_235/0.22),transparent_60%)]"
        aria-hidden
      />
      <div className="relative mx-auto max-w-3xl px-4 py-[clamp(4.5rem,11vw,8rem)] text-center sm:px-6">
        <h2 className="font-sx-sans text-[clamp(1.7rem,3.6vw+0.5rem,2.9rem)] font-semibold leading-[1.14] tracking-[-0.035em] text-white">
          Your business already has enough moving parts.
          <span className="mt-1 block text-white/55">Bring them together.</span>
        </h2>

        <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
          <TrackedCtaLink
            href="/signup"
            event="homepage_primary_cta"
            surface="home_final_cta"
            className="inline-flex min-h-11 items-center justify-center rounded-sx-sm bg-white px-8 py-3.5 font-sx-sans text-sm font-semibold text-[#0a1020] transition-colors hover:bg-white/90 motion-reduce:transition-none"
          >
            Get started free
          </TrackedCtaLink>
          <Link
            href="/contact?intent=demo"
            className="inline-flex min-h-11 items-center justify-center rounded-sx-sm border border-white/25 bg-white/[0.06] px-8 py-3.5 font-sx-sans text-sm font-semibold text-white transition-colors hover:bg-white/[0.12] motion-reduce:transition-none"
          >
            Book a demo
          </Link>
        </div>

        {/* Tertiary path stays a quiet text link so the bookend keeps two buttons. */}
        <p className="mt-7 font-sx-sans text-[13.5px] text-white/45">
          Still deciding?{" "}
          <Link href="/audit" className="font-semibold text-white/80 underline-offset-4 hover:underline">
            Start with a Business Growth Audit
          </Link>
        </p>
      </div>
    </section>
  );
}
