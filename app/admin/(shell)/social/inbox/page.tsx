import { requireOwnerContext } from "@/lib/social/db-context";
import { listConversations } from "@/lib/social/repositories/inbox";

export default async function InboxPage() {
  // See layout.tsx: nested pages guard independently of the parent layout.
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return null;

  const conversations = await listConversations(ctx, 50);
  const hasAny = conversations.length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--saut-text-muted)" }}>
          Comments, messages, and mentions across connected accounts.
        </p>
      </div>

      {!hasAny && (
        <div className="saut-card p-6 text-center">
          <p className="text-sm font-medium">No events received yet</p>
          <p className="mx-auto mt-2 max-w-md text-xs" style={{ color: "var(--saut-text-subtle)" }}>
            The webhook receiver exists (<code className="saut-mono">/api/social/webhooks/[provider]</code>, signature-verified) and
            comment events normalize into conversations automatically — but the Meta App Dashboard subscription hasn&apos;t
            been configured yet, so nothing has arrived. See Integrations → Webhooks for the exact callback URL and
            setup step.
          </p>
        </div>
      )}

      {hasAny && (
        <div className="space-y-2">
          {conversations.map((c) => (
            <div key={c.id} className="saut-card flex items-center justify-between gap-3 p-3 text-sm">
              <div>
                <span className="font-medium">{c.author_name ?? c.author_handle ?? "Unknown"}</span>{" "}
                <span className="text-xs capitalize" style={{ color: "var(--saut-text-subtle)" }}>
                  · {c.provider} · {c.source.toLowerCase()}
                </span>
              </div>
              <span className="saut-chip saut-chip-info">
                <span className="saut-chip-dot" /> {c.status.toLowerCase()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
