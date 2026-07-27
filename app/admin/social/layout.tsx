import type { Metadata } from "next";
import { requireOwnerContext } from "@/lib/social/db-context";
import { getAutomationSettings } from "@/lib/social/repositories/automation";
import AdminLogin from "../AdminLogin";
import SocialShell from "./SocialShell";
import AgentPanel from "./agent/AgentPanel";
import "./social-theme.css";

export const metadata: Metadata = {
  title: "Social Autopilot — Stratxcel Admin",
  robots: { index: false, follow: false },
};

/**
 * Single admin-auth gate for the entire /admin/social subtree. Every nested
 * page (Command Center, Create, Planner, Inbox, Analytics, Automations,
 * Brand Brain, Integrations, System, Settings) renders inside this — no
 * page re-implements the auth check.
 *
 * Nested pages/segments in the App Router execute independently of what
 * this layout ultimately renders — Next.js still invokes each page's Server
 * Component to build the tree even when this component's own returned JSX
 * discards {children} below. Every nested page therefore carries its own
 * `requireOwnerContext()` guard too, so an unauthenticated hit never
 * constructs a client or queries real data on the way to being discarded.
 */
export default async function SocialLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOwnerContext();

  if (!ctx.ok) {
    if (ctx.status === 401) return <AdminLogin />;
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05070e] px-4">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-7 text-center">
          <h1 className="text-xl font-semibold text-white">No access</h1>
          <p className="mt-2 text-sm text-slate-400">Not authorised for Social Autopilot.</p>
        </div>
      </main>
    );
  }

  const settings = await getAutomationSettings(ctx);

  return (
    <div className="saut-root">
      <SocialShell email={ctx.email ?? ""} shadowMode={settings.shadow_mode}>
        {children}
      </SocialShell>
      <AgentPanel />
    </div>
  );
}
