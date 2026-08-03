import type { Metadata } from "next";
import { requireOwnerContext } from "@/lib/social/db-context";
import { setMessageStatusAction } from "@/app/admin/actions";
import LeadAnalytics from "@/app/admin/LeadAnalytics";

export const metadata: Metadata = {
  title: "Contact inbox — Stratxcel Admin",
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

const STATUS_STYLES: Record<ContactMessage["status"], string> = {
  new: "bg-sky-400/15 text-sky-300",
  read: "bg-slate-400/15 text-slate-300",
  replied: "bg-emerald-400/15 text-emerald-300",
  archived: "bg-slate-600/20 text-slate-500",
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
        <h1 className="text-xl font-semibold text-slate-100">Contact inbox</h1>
        <p className="mt-1 text-sm text-slate-400">
          {list.length} message{list.length === 1 ? "" : "s"} · {newCount} new
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Could not load messages: {error.message}
        </div>
      )}

      <section className="space-y-3">
        {list.length === 0 && !error ? (
          <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-8 text-center text-sm text-slate-400">
            No messages yet. They&rsquo;ll land here the moment someone sends a transmission from the site.
          </p>
        ) : (
          list.map((m) => (
            <article key={m.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-semibold text-white">{m.name}</span>
                  <a href={`mailto:${m.email}`} className="text-sm text-sky-300 hover:underline">
                    {m.email}
                  </a>
                  {m.company && <span className="text-xs text-slate-400">{m.company}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[m.status]}`}>
                    {m.status}
                  </span>
                  <span className="font-mono text-[11px] text-slate-500">
                    {new Date(m.created_at).toISOString().slice(0, 16).replace("T", " ")}
                  </span>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{m.message}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-600">via {m.source}</span>
                <div className="ml-auto flex gap-1.5">
                  {(["read", "replied", "archived"] as const)
                    .filter((s) => s !== m.status)
                    .map((s) => (
                      <form key={s} action={setMessageStatusAction}>
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="status" value={s} />
                        <button className="rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-slate-400 transition-colors hover:border-white/25 hover:text-white">
                          mark {s}
                        </button>
                      </form>
                    ))}
                </div>
              </div>
            </article>
          ))
        )}
      </section>

      <LeadAnalytics />
    </div>
  );
}
