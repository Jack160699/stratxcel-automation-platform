import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AdminLogin from "./AdminLogin";
import LeadAnalytics from "./LeadAnalytics";
import { setMessageStatusAction, signOutAction } from "./actions";
import { Mark } from "@/app/components/Mark";

export const metadata: Metadata = {
  title: "Admin console — Stratxcel",
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

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <AdminLogin />;

  const { data: adminRow } = await supabase
    .from("stratxcel_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminRow) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05070e] px-4">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-7 text-center">
          <h1 className="text-xl font-semibold text-white">No access</h1>
          <p className="mt-2 text-sm text-slate-400">
            {user.email} is not authorised for this console.
          </p>
          <form action={signOutAction} className="mt-5">
            <button className="rounded-lg border border-white/15 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.05]">
              Sign out
            </button>
          </form>
        </div>
      </main>
    );
  }

  const { data: messages, error } = await supabase
    .from("stratxcel_contact_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  const list = (messages ?? []) as ContactMessage[];
  const newCount = list.filter((m) => m.status === "new").length;

  return (
    <main className="min-h-screen bg-[#05070e] text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <Mark className="h-8 w-8" />
              <span className="font-mono text-[11px] tracking-[0.35em] text-slate-300">
                STRATXCEL
              </span>
            </div>
            <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
              Admin console
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Signed in as {user.email} · {list.length} messages · {newCount} new
            </p>
          </div>
          <form action={signOutAction}>
            <button className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.05]">
              Sign out
            </button>
          </form>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            Could not load messages: {error.message}
          </div>
        )}

        <section className="mt-8 space-y-3">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-white">
            Contact inbox
          </h2>
          {list.length === 0 && !error ? (
            <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-8 text-center text-sm text-slate-400">
              No messages yet. They&rsquo;ll land here the moment someone sends
              a transmission from the site.
            </p>
          ) : (
            list.map((m) => (
              <article
                key={m.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-semibold text-white">{m.name}</span>
                    <a
                      href={`mailto:${m.email}`}
                      className="text-sm text-sky-300 hover:underline"
                    >
                      {m.email}
                    </a>
                    {m.company && (
                      <span className="text-xs text-slate-400">{m.company}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[m.status]}`}
                    >
                      {m.status}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {new Date(m.created_at).toISOString().slice(0, 16).replace("T", " ")}
                    </span>
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
                  {m.message}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-600">
                    via {m.source}
                  </span>
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
    </main>
  );
}
