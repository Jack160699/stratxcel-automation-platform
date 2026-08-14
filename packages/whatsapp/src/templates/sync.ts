import type { ServiceClient } from "../db.ts";
import { getIntegrationMode } from "../flags.ts";
import { inspectMetaTemplateEndpoint } from "./meta-api.ts";
import { resolvePlatformWhatsAppSender } from "../platform-sender.ts";

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

export interface PlatformTemplateResolution {
  templates: WhatsAppTemplateRow[];
  source: "meta_live" | "cached_db" | "disabled";
  lastVerifiedAt: string | null;
  metaAvailable: boolean;
  senderStatus: "CONFIGURED" | "SENDER_NOT_CONFIGURED";
}

/**
 * Pulls the real, current template list + approval status from Meta's own
 * Graph API — never fabricates an APPROVED status. In 'disabled'/'shadow'
 * mode (no real WABA ID or token configured), this is a documented no-op
 * rather than a fake success, matching WHATSAPP_INTEGRATION_MODE's existing
 * fail-safe convention.
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

/**
 * Automatically resolves and seeds/updates platform-critical templates
 * (specifically `audit_report_ready`) from Meta's authoritative API without
 * requiring manual sync button clicks or tenant selection.
 */
export async function autoResolvePlatformTemplates(
  supabase: ServiceClient,
  options: { forceRefresh?: boolean; fetchFn?: typeof fetch } = {}
): Promise<PlatformTemplateResolution> {
  const mode = getIntegrationMode("WHATSAPP_INTEGRATION_MODE");
  const fetchFn = options.fetchFn ?? fetch;

  const platformSender = await resolvePlatformWhatsAppSender(supabase);
  if (!platformSender.ok) {
    // Attempt fallback query on any existing platform templates in database
    const { data } = await supabase
      .from("whatsapp_templates")
      .select("*")
      .eq("name", "audit_report_ready")
      .order("synced_at", { ascending: false });

    const templates = (data ?? []) as WhatsAppTemplateRow[];
    return {
      templates,
      source: mode === "live" ? "cached_db" : "disabled",
      lastVerifiedAt: templates[0]?.synced_at ?? null,
      metaAvailable: false,
      senderStatus: "SENDER_NOT_CONFIGURED",
    };
  }

  const { tenantId, bindingId, wabaId, phoneNumberId } = platformSender.sender;

  // 1. Check existing local template
  const existingTemplates = await listTemplatesForTenant(supabase, tenantId);
  const auditTemplate = existingTemplates.find((t) => t.name === "audit_report_ready");

  // If live mode is not enabled, return existing local data
  if (mode !== "live") {
    return {
      templates: existingTemplates,
      source: "disabled",
      lastVerifiedAt: auditTemplate?.synced_at ?? null,
      metaAvailable: false,
      senderStatus: "CONFIGURED",
    };
  }

  // Check TTL cache (60 seconds) unless forceRefresh is true
  const now = Date.now();
  const lastSyncTime = auditTemplate?.synced_at ? new Date(auditTemplate.synced_at).getTime() : 0;
  const isCacheFresh = !options.forceRefresh && (now - lastSyncTime < 60000);

  if (isCacheFresh && auditTemplate) {
    return {
      templates: existingTemplates,
      source: "cached_db",
      lastVerifiedAt: auditTemplate.synced_at,
      metaAvailable: true,
      senderStatus: "CONFIGURED",
    };
  }

  // 2. Perform live Meta sync for the platform sender
  try {
    await syncTemplatesForBinding(
      supabase,
      { tenantId, phoneBindingId: bindingId, wabaId, phoneNumberId },
      fetchFn
    );

    const freshTemplates = await listTemplatesForTenant(supabase, tenantId);
    const freshAudit = freshTemplates.find((t) => t.name === "audit_report_ready");

    return {
      templates: freshTemplates,
      source: "meta_live",
      lastVerifiedAt: freshAudit?.synced_at ?? new Date().toISOString(),
      metaAvailable: true,
      senderStatus: "CONFIGURED",
    };
  } catch (err) {
    // Graceful fallback to cached database records if Meta is temporarily offline
    const { data: allAudits } = await supabase
      .from("whatsapp_templates")
      .select("*")
      .eq("name", "audit_report_ready")
      .order("synced_at", { ascending: false });

    const fallbackTemplates = existingTemplates.length > 0
      ? existingTemplates
      : ((allAudits ?? []) as WhatsAppTemplateRow[]);

    return {
      templates: fallbackTemplates,
      source: "cached_db",
      lastVerifiedAt: auditTemplate?.synced_at ?? fallbackTemplates[0]?.synced_at ?? null,
      metaAvailable: false,
      senderStatus: "CONFIGURED",
    };
  }
}

/** Only a template Meta itself reports as APPROVED may ever be used for a real send. */
export async function isTemplateUsable(supabase: ServiceClient, tenantId: string, templateId: string): Promise<boolean> {
  const { data } = await supabase.from("whatsapp_templates").select("status").eq("id", templateId).eq("tenant_id", tenantId).maybeSingle();
  return data?.status === "APPROVED";
}

/**
 * Validates that `audit_report_ready` template is currently APPROVED by Meta before outbound sending.
 */
export async function ensureAuditReportTemplateApproved(
  supabase: ServiceClient,
  fetchFn: typeof fetch = fetch
): Promise<{ approved: boolean; template?: WhatsAppTemplateRow; reason?: string }> {
  const resolution = await autoResolvePlatformTemplates(supabase, { fetchFn });
  const auditTemplate = resolution.templates.find((t) => t.name === "audit_report_ready");

  if (!auditTemplate) {
    return { approved: false, reason: "audit_report_ready template not found on Meta" };
  }
  if (auditTemplate.status !== "APPROVED") {
    return { approved: false, template: auditTemplate, reason: `Template status is ${auditTemplate.status}` };
  }

  return { approved: true, template: auditTemplate };
}
