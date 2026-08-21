import { getPublicIntegrations, type IntegrationStatus } from "@/lib/commercial/catalog";
import { Card } from "@/components/ui/Card";

const STATUS_LABEL: Record<IntegrationStatus, string> = { connected: "Connected", available: "Available", coming_soon: "Coming soon" };
const STATUS_STYLE: Record<IntegrationStatus, string> = {
  connected: "bg-sx-accent/15 text-sx-accent",
  available: "bg-sx-surface-2 text-sx-text-muted",
  coming_soon: "bg-sx-border/40 text-sx-text-subtle",
};

export function IntegrationsShowcase({ showComingSoon = true, className = "" }: { showComingSoon?: boolean; className?: string }) {
  const publicIntegrations = getPublicIntegrations();
  const items = showComingSoon ? publicIntegrations : publicIntegrations.filter((i) => i.status !== "coming_soon");
  const groups: { title: string; desc: string; status: IntegrationStatus }[] = [
    { title: "Connected", desc: "Live provider implementations.", status: "connected" },
    { title: "Available", desc: "Staff-assisted or scoped setup.", status: "available" },
    { title: "Coming soon", desc: "Never presented as fully connected.", status: "coming_soon" },
  ];
  return (
    <div className={className}>
      {groups.map((g) => {
        const groupItems = items.filter((i) => i.status === g.status);
        if (!showComingSoon && g.status === "coming_soon") return null;
        if (groupItems.length === 0) return null;
        return (
          <div key={g.status} className={g.status !== "connected" ? "mt-10" : ""}>
            <h3 className="font-sx-sans text-lg font-semibold text-sx-text">{g.title}</h3>
            <p className="mt-1 text-sm text-sx-text-muted">{g.desc}</p>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {groupItems.map((integration) => (
                <li key={integration.id}>
                  <Card variant="panel" className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-sx-sans text-sm font-semibold text-sx-text">{integration.name}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 font-sx-mono text-[9px] font-bold uppercase ${STATUS_STYLE[integration.status]}`}>{STATUS_LABEL[integration.status]}</span>
                    </div>
                    {integration.note ? <p className="mt-2 text-xs text-sx-text-muted">{integration.note}</p> : null}
                  </Card>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
