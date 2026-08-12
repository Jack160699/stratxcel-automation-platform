import { requireOwnerContext } from "@/lib/social/db-context";
import { listSessions } from "@/lib/social/repositories/agent";
import { listRecentVariants } from "@/lib/social/repositories/content";
import { resolveEffectiveProviderIdentity } from "@/lib/social/agent/provider";
import { CopilotProvider } from "../social/copilot/CopilotContext";
import { CopilotFullPage } from "../social/copilot/CopilotFullPage";
import { AdminOperationsCopilot } from "./AdminOperationsCopilot";
import "../social/social-components.css";

export default async function AdminCopilotPage({ searchParams }: { searchParams: Promise<{ context?: string }> }) {
  const { context } = await searchParams;
  if (context !== "social") return <AdminOperationsCopilot />;

  const ctx = await requireOwnerContext();
  if (!ctx.ok) return null;
  const [sessions, variants] = await Promise.all([listSessions(ctx, 30), listRecentVariants(ctx, 8)]);
  return (
    <section className="social-operations">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sx-text-subtle">Admin Copilot · Social context</p>
        <h1 className="mt-1 font-sx-sans text-xl font-semibold text-sx-text">Social Operations</h1>
      </div>
      <CopilotProvider>
        <CopilotFullPage initialSessions={sessions} initialVariants={variants} provider={resolveEffectiveProviderIdentity()} />
      </CopilotProvider>
    </section>
  );
}
