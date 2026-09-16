import { requireClientContext } from "@/lib/tenants/client-context";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { loadTenantInstagramCampaigns } from "@/lib/social/instagram-campaign-inventory";
import type { CampaignItemStatus } from "@/lib/social/instagram-campaign";
import { Card } from "@/components/ui/Card";
import { Metric } from "@/components/ui/Metric";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import { EmptyState } from "@/components/ui/Feedback";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUS_CHIP: Record<CampaignItemStatus, { label: string; state: ChipState }> = {
  PUBLISHED: { label: "Published", state: "success" },
  SCHEDULED: { label: "Scheduled", state: "accent" },
  BLOCKED_BY_PLATFORM_LIMIT: { label: "Blocked · Instagram limit", state: "warning" },
  BLOCKED_CLAIM_REVIEW: { label: "Blocked · claim review", state: "warning" },
  FORMAT_INELIGIBLE_FOR_INSTAGRAM_FEED: { label: "Not feed format", state: "neutral" },
  FAILED: { label: "Failed", state: "danger" },
  NOT_ATTEMPTED: { label: "Not attempted", state: "dashed" },
};

const CTA_LABEL = { website: "Website", whatsapp: "WhatsApp", call: "Call" } as const;

function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/**
 * Campaigns — the tenant's Instagram campaign inventory: every asset, including
 * ones that cannot go to the feed, with its real publishing status. Membership
 * (or staff support access) is verified by requireClientContext; the loader
 * then scopes every read to this tenant.
 */
export default async function ContentCampaignsPage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;

  const tenantId = ctx.workspaceTenant.tenantId;
  const campaigns = await loadTenantInstagramCampaigns(
    createSupabaseServiceClient() as unknown as Parameters<typeof loadTenantInstagramCampaigns>[0],
    tenantId,
    { thumbnails: true }
  );

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Campaigns</h1>
        <p className="mt-1 text-sm text-sx-text-muted">Every campaign asset and its real Instagram status.</p>
      </header>

      {campaigns.length === 0 && <EmptyState title="No campaigns yet." subtitle="Campaign assets appear here once a campaign is set up for this workspace." />}

      {campaigns.map(({ campaign, account, summary, items }) => (
        <section key={campaign.id} className="flex flex-col gap-4">
          <Card>
            <h2 className="font-sx-sans text-lg font-semibold text-sx-text">{campaign.name}</h2>
            <p className="mt-1 text-sm text-sx-text-muted">
              Instagram: {account ? `${account.username} · ${account.status === "CONNECTED" && account.tokenHealth === "HEALTHY" ? "connected" : "needs reconnect"}` : "not connected"}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              <Metric label="Total assets" value={summary.total} />
              <Metric label="Feed eligible" value={summary.feedEligible} />
              <Metric label="Format ineligible" value={summary.formatIneligible} />
              <Metric label="Published" value={summary.published} />
              <Metric label="Scheduled" value={summary.scheduled} />
              <Metric label="Blocked" value={summary.blocked} />
              <Metric label="Failed" value={summary.failed} />
              <Metric label="Not attempted" value={summary.notAttempted} />
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => {
              const chip = STATUS_CHIP[item.status.status];
              const time = formatTime(item.status.at);
              return (
                <article key={item.variantId} className="flex flex-col gap-3 rounded-sx-md border border-sx-border bg-sx-surface-1 p-3">
                  <div className="flex gap-3">
                    {item.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not worth Next/Image's remote-pattern config for a 10-minute link
                      <img src={item.thumbnailUrl} alt={item.spec.headline} className="h-28 w-24 flex-none rounded-sx-xs object-cover" />
                    ) : (
                      <div className="h-28 w-24 flex-none rounded-sx-xs bg-sx-surface-2" />
                    )}
                    <div className="min-w-0 flex-1">
                      <StatusChip state={chip.state}>{chip.label}</StatusChip>
                      <h3 className="mt-2 text-sm font-semibold text-sx-text">{item.spec.headline}</h3>
                      <p className="mt-1 font-sx-mono text-[11px] text-sx-text-subtle">
                        {item.spec.asset_name} · {item.spec.width}×{item.spec.height}
                      </p>
                      <p className="mt-1 text-xs text-sx-text-muted">
                        CTA: {CTA_LABEL[item.spec.cta_type]} · #{item.spec.hashtag_group}
                        {time ? ` · ${time}` : ""}
                      </p>
                      {item.status.permalink && (
                        <a href={item.status.permalink} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-sx-accent hover:underline">
                          View on Instagram{item.status.providerVerified ? " · verified" : ""}
                        </a>
                      )}
                      {item.status.detail && <p className="mt-1 text-xs text-sx-text-subtle">{item.status.detail}</p>}
                    </div>
                  </div>
                  <details className="text-xs text-sx-text-muted">
                    <summary className="cursor-pointer text-sx-text">Caption &amp; hashtags</summary>
                    <p className="mt-2 whitespace-pre-line">{item.caption}</p>
                    <p className="mt-2 text-sx-accent">{item.hashtags.map((tag) => `#${tag}`).join(" ")}</p>
                  </details>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
