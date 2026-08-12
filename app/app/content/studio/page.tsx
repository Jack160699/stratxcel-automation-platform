import { requireClientContext } from "@/lib/tenants/client-context";
import { CreativeStudioWorkspace } from "./CreativeStudioWorkspace";

export default async function ContentStudioPage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;
  const active = ctx.workspaceTenant;
  const [{ data: brain }, { data: subscription }] = await Promise.all([
    ctx.supabase.from("brand_brains").select("current_version").eq("tenant_id", active.tenantId).maybeSingle(),
    ctx.supabase.from("subscriptions").select("id").eq("tenant_id", active.tenantId).eq("status", "active").limit(1).maybeSingle(),
  ]);
  const providerConfigured = Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
  return (
    <CreativeStudioWorkspace
      providerConfigured={providerConfigured}
      subscriptionReady={Boolean(subscription)}
      brandBrainVersion={brain?.current_version ?? null}
      missingEnvironment={providerConfigured ? [] : ["GEMINI_API_KEY or OPENAI_API_KEY"]}
    />
  );
}
