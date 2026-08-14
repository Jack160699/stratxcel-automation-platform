import type { ServiceClient } from "../db.ts";
import { getIntegrationMode } from "../flags.ts";
import { inspectMetaTemplateEndpoint } from "./meta-api.ts";

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
  input: { tenantId: string; phoneBindingId: string; wabaId: string; phoneNumberId: string },
  fetchFn: typeof fetch = fetch
): Promise<{ synced: number; mode: "disabled" | "shadow" | "live" }> {
  const mode = getIntegrationMode("WHATSAPP_INTEGRATION_MODE");
  if (mode !== "live") {
    return { synced: 0, mode };
  }

  const inspection = await inspectMetaTemplateEndpoint(
    { wabaId: input.wabaId, phoneNumberId: input.phoneNumberId },
    fetchFn,
  );
  if (!inspection.resolvedWabaId || !inspection.templates) {
    throw new Error("Meta template sync failed: no canonical WhatsApp Business Account resolved");
  }

  if (inspection.resolvedWabaId !== input.wabaId) {
    const { error } = await supabase
      .from("whatsapp_phone_bindings")
      .update({ waba_id: inspection.resolvedWabaId, updated_at: new Date().toISOString() })
      .eq("id", input.phoneBindingId)
      .eq("phone_number_id", input.phoneNumberId);
    if (error) throw new Error(`Unable to persist canonical WABA ID: ${error.message}`);
  }

  let synced = 0;
  for (const entry of inspection.templates) {
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
    if (error) throw new Error(`Unable to persist Meta template ${entry.name}: ${error.message}`);
    synced += 1;
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
