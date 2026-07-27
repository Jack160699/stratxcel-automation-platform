import { requireOwnerContext } from "@/lib/social/db-context";
import { listAccounts } from "@/lib/social/repositories/accounts";
import { listProviderConfigs } from "@/lib/social/repositories/providers-config";
import { listProviders } from "@/lib/social/agent/provider";
import { disconnectAccountAction } from "../actions";

const PLATFORMS = ["instagram", "facebook", "threads", "linkedin", "youtube"] as const;
const PLATFORM_LABEL: Record<(typeof PLATFORMS)[number], string> = {
  instagram: "Instagram",
  facebook: "Facebook Page",
  threads: "Threads",
  linkedin: "LinkedIn",
  youtube: "YouTube",
};

const CAPABILITY_MATRIX: Record<(typeof PLATFORMS)[number], string[]> = {
  instagram: ["publish_image", "publish_carousel", "publish_video", "comments_read", "comments_reply", "insights"],
  facebook: ["publish_text", "publish_image", "publish_video", "comments_read", "comments_reply", "insights"],
  threads: ["publish_text", "publish_image", "insights"],
  linkedin: ["publish_text", "publish_image"],
  youtube: ["publish_video", "insights"],
};

function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toISOString().slice(0, 16).replace("T", " ");
}

export default async function IntegrationsPage() {
  // See layout.tsx: nested pages guard independently of the parent layout.
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return null;

  const [accounts, aiConfigs] = await Promise.all([listAccounts(ctx), listProviderConfigs(ctx, "AI")]);
  const providers = listProviders();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--saut-text-muted)" }}>
          Social accounts, AI providers, and their real capability state.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="saut-section-title">Social accounts</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PLATFORMS.map((platform) => {
            const acct = accounts.find((a) => a.platform === platform && a.status === "CONNECTED");
            const reauth = accounts.find((a) => a.platform === platform && a.status === "REAUTH_REQUIRED");
            const active = acct ?? reauth;
            return (
              <div key={platform} className="saut-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{PLATFORM_LABEL[platform]}</span>
                  {acct ? (
                    <span className="saut-chip saut-chip-success">
                      <span className="saut-chip-dot" /> connected
                    </span>
                  ) : reauth ? (
                    <span className="saut-chip saut-chip-danger">
                      <span className="saut-chip-dot" /> reauth needed
                    </span>
                  ) : (
                    <span className="saut-chip saut-chip-neutral">
                      <span className="saut-chip-dot" /> not connected
                    </span>
                  )}
                </div>
                {active ? (
                  <>
                    <p className="mt-2 truncate text-xs" style={{ color: "var(--saut-text-muted)" }}>
                      {active.username}
                    </p>
                    <p className="saut-mono mt-1 text-[11px]" style={{ color: "var(--saut-text-subtle)" }}>
                      last synced {fmt(active.last_sync_at)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {CAPABILITY_MATRIX[platform].map((cap) => (
                        <span key={cap} className="saut-mono rounded px-1.5 py-0.5 text-[9.5px]" style={{ background: "var(--saut-surface-2)", color: "var(--saut-text-subtle)" }}>
                          {cap}
                        </span>
                      ))}
                    </div>
                    {acct && (
                      <form action={disconnectAccountAction} className="mt-3">
                        <input type="hidden" name="id" value={acct.id} />
                        <button className="saut-btn saut-btn-danger !h-7 !px-2.5 text-[11px]">Disconnect</button>
                      </form>
                    )}
                    {reauth && (
                      <a href={`/api/social/oauth/${platform}/connect`} className="saut-btn saut-btn-primary mt-3 inline-flex !h-7 !px-2.5 text-[11px]">
                        Reconnect
                      </a>
                    )}
                  </>
                ) : (
                  <a href={`/api/social/oauth/${platform}/connect`} className="saut-btn saut-btn-secondary mt-3 inline-flex !h-7 !px-2.5 text-[11px]">
                    Connect
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="saut-section-title">AI providers</h2>
        <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>
          Keys are read from server environment variables — never entered or stored here. Add{" "}
          <code className="saut-mono">OPENAI_API_KEY</code> or <code className="saut-mono">ANTHROPIC_API_KEY</code> to your deployment
          environment to enable the Agent&apos;s reasoning.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {providers.map((p) => {
            const configured = p.isConfigured();
            const stored = aiConfigs.find((c) => c.provider === p.name);
            return (
              <div key={p.name} className="saut-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold capitalize">{p.name}</span>
                  {configured ? (
                    <span className="saut-chip saut-chip-success">
                      <span className="saut-chip-dot" /> configured
                    </span>
                  ) : (
                    <span className="saut-chip saut-chip-neutral">
                      <span className="saut-chip-dot" /> not configured
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs" style={{ color: "var(--saut-text-subtle)" }}>
                  {configured ? `Reading from ${p.envKey}` : `Set ${p.envKey} to enable`}
                </p>
                {stored?.last_tested_at && (
                  <p className="saut-mono mt-1 text-[11px]" style={{ color: "var(--saut-text-subtle)" }}>
                    last tested {fmt(stored.last_tested_at)}
                  </p>
                )}
              </div>
            );
          })}
          <div className="saut-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Media generation</span>
              <span className="saut-chip saut-chip-neutral">
                <span className="saut-chip-dot" /> not configured
              </span>
            </div>
            <p className="mt-2 text-xs" style={{ color: "var(--saut-text-subtle)" }}>
              No image/video generation provider is wired up yet.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="saut-section-title">Webhooks</h2>
        <div className="saut-card p-4">
          <p className="text-sm" style={{ color: "var(--saut-text-muted)" }}>
            No inbound webhook receiver is configured yet — comments, messages, and mentions are not being ingested in
            real time. <code className="saut-mono">social_webhook_events</code> is ready to receive them once a
            receiver route exists.
          </p>
        </div>
      </section>
    </div>
  );
}
