import { EmptyState } from "@/components/ui/Feedback";

/**
 * Honest placeholder for /app pages whose backend doesn't exist yet
 * (Website & SEO, Ads, and the rest listed in
 * docs/product-design/CLIENT_APP_INFORMATION_ARCHITECTURE.md §5 as
 * genuinely new capability, not a re-skin of something already built).
 * Per the explicit instruction: build honest foundation states, never
 * fabricate connected data, keep disabled actions visibly disabled, never
 * claim production readiness.
 */
export function FoundationPage({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">{title}</h1>
      </header>
      <EmptyState title="Not yet connected" subtitle={note} />
    </div>
  );
}
