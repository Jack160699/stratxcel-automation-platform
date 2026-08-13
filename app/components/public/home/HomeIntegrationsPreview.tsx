import Link from "next/link";
import { IntegrationsShowcase } from "@/app/components/public/commercial/IntegrationsShowcase";

export function HomeIntegrationsPreview() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <p className="font-sx-mono text-[11px] font-bold uppercase tracking-[0.18em] text-sx-accent">Integrations</p>
        <h2 className="mt-3 font-sx-sans text-2xl font-bold text-sx-text sm:text-3xl">Connect what your team authorizes</h2>
        <p className="mt-3 text-sm text-sx-text-muted sm:text-base">
          OAuth grants, bindings, and payment rails labeled honestly — connected, available, or coming soon.
        </p>
      </div>

      <IntegrationsShowcase showComingSoon={false} className="mt-10" />

      <div className="mt-8 text-center">
        <Link href="/integrations" className="text-sm font-semibold text-sx-accent hover:underline">
          View all integrations →
        </Link>
      </div>
    </div>
  );
}
