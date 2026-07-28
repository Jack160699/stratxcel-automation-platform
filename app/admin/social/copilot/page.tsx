import type { Metadata } from "next";
import { requireOwnerContext } from "@/lib/social/db-context";
import { listSessions } from "@/lib/social/repositories/agent";
import { listRecentVariants } from "@/lib/social/repositories/content";
import { CopilotFullPage } from "./CopilotFullPage";

export const metadata: Metadata = {
  title: "Copilot — Social Autopilot — Stratxcel Admin",
  robots: { index: false, follow: false },
};

export default async function CopilotPage() {
  // See ../layout.tsx: nested pages guard independently of the parent layout.
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return null;

  const [sessions, variants] = await Promise.all([listSessions(ctx, 30), listRecentVariants(ctx, 8)]);

  return <CopilotFullPage initialSessions={sessions} initialVariants={variants} />;
}
