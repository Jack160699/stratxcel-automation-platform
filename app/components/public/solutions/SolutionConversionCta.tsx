import Link from "next/link";
export function SolutionConversionCta() {
  return (
    <section id="get-started" className="bg-sx-surface-1">
      <div className="mx-auto max-w-3xl px-4 py-14 text-center">
        <h2 className="text-2xl font-bold">Pick an outcome. Stratxcel connects the work behind it.</h2>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/signup" className="rounded-sx-sm bg-sx-accent px-7 py-3 text-sm font-bold text-sx-accent-on">Start with Stratxcel</Link>
          <Link href="/audit" className="rounded-sx-sm border border-sx-border-strong px-7 py-3 text-sm font-semibold">Start with the Audit</Link>
        </div>
      </div>
    </section>
  );
}
