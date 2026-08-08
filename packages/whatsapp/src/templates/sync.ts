import type { ServiceClient } from "../db.ts";
import { getIntegrationMode } from "../flags.ts";

export interface WhatsAppTemplateRow {
  id: string;
  tenant_id: string;
  phone_binding_id: string | null;
  name: string;
  language: string;
  category: string | null;
  provider_template_id: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "DISABLED" | "PAUSED";
  components: unknown[];
  synced_at: string | null;
}

interface MetaTemplateApiEntry {
  id: string;
  name: string;
  language: string;
  category?: string;
  status?: string;
  components?: unknown[];
}

/**
 * Pulls the real, current template list + approval status from Meta's own
 * Graph API — never fabricates an APPROVED status. In 'disabled'/'shadow'
 * mode (no real WABA ID or token configured), this is a documented no-op
 * rather than a fake success, matching WHATSAPP_INTEGRATION_MODE's existing
 * fail-safe convention. Template *creation/submission* is not implemented
 * here — it requires Meta Business Manager UI access this repository has
 * no credentials for; this only syncs templates that already exist there.
 */
export async function syncTemplatesForBinding(
  supabase: ServiceClient,
  input: { tenantId: string; phoneBindingId: string; wabaId: string },
  fetchFn: typeof fetch = fetch
): Promise<{ synced: number; mode: "disabled" | "shadow" | "live" }> {
  const mode = getIntegrationMode("WHATSAPP_INTEGRATION_MODE");
  if (mode !== "live") {
    return { synced: 0, mode };
  }

  const token = process.env.WHATSAPP_TOKEN;
  const apiVersion = process.env.WHATSAPP_GRAPH_API_VERSION ?? "v20.0";
  if (!token) {
    throw new Error("WHATSAPP_INTEGRATION_MODE is 'live' but WHATSAPP_TOKEN is not set");
  }

  const response = await fetchFn(`https://graph.facebook.com/${apiVersion}/${input.wabaId}/message_templates?limit=200`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Meta template sync failed: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { data?: MetaTemplateApiEntry[] };

  let synced = 0;
  for (const entry of body.data ?? []) {
    const status = (entry.status ?? "PENDING").toUpperCase();
    const normalizedStatus = ["PENDING", "APPROVED", "REJECTED", "DISABLED", "PAUSED"].includes(status) ? status : "PENDING";

    const { error } = await supabase
      .from("whatsapp_templates")
      .upsert(
        {
          tenant_id: input.tenantId,
          phone_binding_id: input.phoneBindingId,
          name: entry.name,
          language: entry.language,
          category: entry.category ?? null,
          provider_template_id: entry.id,
          status: normalizedStatus,
          components: entry.components ?? [],
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,name,language" }
      );
    if (!error) synced += 1;
  }

  return { synced, mode };
}

export async function listTemplatesForTenant(supabase: ServiceClient, tenantId: string): Promise<WhatsAppTemplateRow[]> {
  const { data, error } = await supabase.from("whatsapp_templates").select("*").eq("tenant_id", tenantId).order("name", { ascending: true });
  if (error) throw new Error(`listTemplatesForTenant: ${error.message}`);
  return (data ?? []) as WhatsAppTemplateRow[];
}

/** Only a template Meta itself reports as APPROVED may ever be used for a real send. */
export async function isTemplateUsable(supabase: ServiceClient, tenantId: string, templateId: string): Promise<boolean> {
  const { data } = await supabase.from("whatsapp_templates").select("status").eq("id", templateId).eq("tenant_id", tenantId).maybeSingle();
  return data?.status === "APPROVED";
}
