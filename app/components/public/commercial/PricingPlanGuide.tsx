import { PRICING_TIERS } from "@/lib/commercial/catalog";
const PLATFORM_TIERS = PRICING_TIERS.filter((t) => t.pillar === "platform" || t.pillar === "growth_execution" || t.pillar === "enterprise");
export function PricingPlanGuide() {
  return (
    <div className="mt-10 overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead><tr className="border-b border-sx-border"><th className="py-3 pr-4 text-[10px] font-bold uppercase text-sx-text-subtle">Plan</th><th className="py-3 pr-4 text-[10px] font-bold uppercase text-sx-text-subtle">Best for</th><th className="py-3 pr-4 text-[10px] font-bold uppercase text-sx-text-subtle">Price</th><th className="py-3 text-[10px] font-bold uppercase text-sx-text-subtle">Upgrade path</th></tr></thead>
        <tbody>{PLATFORM_TIERS.map((tier) => (<tr key={tier.id} className="border-b border-sx-border/60"><td className="py-4 pr-4 font-semibold">{tier.name}</td><td className="py-4 pr-4 text-sx-text-muted">{tier.whoItsFor}</td><td className="py-4 pr-4 font-mono text-xs">{tier.price}</td><td className="py-4 text-xs text-sx-text-muted">{tier.upgradePath ?? "Quote-led"}</td></tr>))}</tbody>
      </table>
    </div>
  );
}
