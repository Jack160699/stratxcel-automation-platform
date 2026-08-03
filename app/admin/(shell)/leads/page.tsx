import type { Metadata } from "next";
import { requireOwnerContext } from "@/lib/social/db-context";
import { setMessageStatusAction } from "@/app/admin/actions";
import LeadAnalytics from "@/app/admin/LeadAnalytics";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import { ErrorState, EmptyState } from "@/components/ui/Feedback";
import { Card } from "@/components/ui/Card";

export const metadata: Metadata = {
  title: "Leads — Stratxcel Admin",
  robots: { index: false, follow: false },
};

interface ContactMessage {
  id: string;
  created_at: string;
  name: string;
  email: string;
  company: string | null;
  message: string;
  source: string;
  status: "new" | "read" | "replied" | "archived";
}

const STATUS_CHIP: Record<ContactMessage["status"], { label: string; state: ChipState }> = {
  new: { label: "New", state: "accent" },
  read: { label: "Read", state: "neutral" },
  replied: { label: "Replied", state: "success" },
  archived: { label: "Archived", state: "neutral" },
};

/**
 * The full contact inbox this used to be at /admin before the unified
 * shell — same data, same actions (mark read/replied/archived), moved
 * under the shell's nav rather than living at the root. Re-guards
 * independently for the same reason every nested page in this build does:
 * the parent layout gating render is not sufficient by itself (see the
 * RSC-payload disclosure fixed for the platform overview page) and this
 * page performs a real database read.
 */
export default async function InboxPage() {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return null;

  const { data: messages, error } = await ctx.supabase
    .from("stratxcel_contact_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  const list = (messages ?? []) as ContactMessage[];
  const newCount = list.filter((m) => m.status === "new").length;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Leads</h1>
        <p className="mt-1 text-sm text-sx-text-muted">
          {list.length} message{list.length === 1 ? "" : "s"} · {newCount} new
        </p>
      </header>

      {error && <ErrorState message={`Could not load messages: ${error.message}`} />}

      <section className="flex flex-col gap-3">
        {list.length === 0 && !error ? (
          <EmptyState title="No messages yet." subtitle="They'll land here the moment someone sends a transmission from the site." />
        ) : (
          list.map((m) => {
            const chip = STATUS_CHIP[m.status];
            return (
              <Card key={m.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-semibold text-sx-text">{m.name}</span>
                    <a href={`mailto:${m.email}`} className="text-sm text-sx-accent hover:underline">
                      {m.email}
                    </a>
                    {m.company && <span className="text-xs text-sx-text-muted">{m.company}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusChip state={chip.state}>{chip.label}</StatusChip>
                    <span className="font-sx-mono text-[11px] text-sx-text-subtle">
                      {new Date(m.created_at).toISOString().slice(0, 16).replace("T", " ")}
                    </span>
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-sx-text-muted">{m.message}</p>
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-sx-border pt-3">
                  <span className="font-sx-mono text-[10px] uppercase tracking-[0.2em] text-sx-text-subtle">via {m.source}</span>
                  <div className="ml-auto flex gap-1.5">
                    {(["read", "replied", "archived"] as const)
                      .filter((s) => s !== m.status)
                      .map((s) => (
                        <form key={s} action={setMessageStatusAction}>
                          <input type="hidden" name="id" value={m.id} />
                          <input type="hidden" name="status" value={s} />
                          <button className="rounded-sx-xs border border-sx-border-strong px-2.5 py-1 text-[11px] text-sx-text-muted transition-colors hover:border-sx-border-strong hover:text-sx-text">
                            mark {s}
                          </button>
                        </form>
                      ))}
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </section>

      <LeadAnalytics />
    </div>
  );
}
