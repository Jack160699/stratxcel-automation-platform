import Link from "next/link";
import { TrustChips } from "@/app/components/public/TrustChips";

export function HomeTrustSection() {
  return (
    <section id="trust" data-home-section="trust" className="border-b border-sx-border">
      <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6 lg:px-8">
        <h2 className="font-sx-sans text-2xl font-bold text-sx-text">Built for owner control</h2>
        <p className="mt-3 text-sm leading-relaxed text-sx-text-muted sm:text-base">
          Sensitive actions — publishing, campaigns, bulk outreach — stay behind human approval. Workspace data is
          isolated per customer. We do not publish fabricated customer counts or conversion rates.
        </p>
        <div className="mt-8 flex justify-center">
          <TrustChips
            items={[
              "Human approval for consequential actions",
              "Tenant-isolated workspace data",
              "Honest capability boundaries",
            ]}
          />
        </div>
        <Link href="/security" className="mt-6 inline-block text-sm font-semibold text-sx-accent hover:underline">
          Read how security works →
        </Link>
      </div>
    </section>
  );
}
