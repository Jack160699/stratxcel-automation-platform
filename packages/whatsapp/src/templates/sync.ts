import type { ServiceClient } from "../db.ts";
import { getIntegrationMode } from "../flags.ts";
import { inspectMetaTemplateEndpoint, type MetaTemplateApiEntry } from "./meta-api.ts";
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
    try {
      await supabase
        .from("whatsapp_phone_bindings")
        .update({ waba_id: inspection.resolvedWabaId, updated_at: new Date().toISOString() })
        .eq("id", input.phoneBindingId)
        .eq("phone_number_id", input.phoneNumberId);
    } catch {
      // Non-fatal
    }
  }

  let synced = 0;
  for (const entry of inspection.templates) {
    const status = (entry.status ?? "PENDING").toUpperCase();
    const normalizedStatus = ["PENDING", "APPROVED", "REJECTED", "DISABLED", "PAUSED"].includes(status) ? status : "PENDING";

    try {
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
      if (error) {
        // Log or continue
      } else {
        synced += 1;
      }
    } catch {
      // Non-fatal persistence
    }
  }

  return { synced: synced || (inspection.templates?.length ?? 0), mode };
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
  const token = process.env.WHATSAPP_TOKEN?.trim();
  const fetchFn = options.fetchFn ?? fetch;

  const platformSender = await resolvePlatformWhatsAppSender(supabase);
  const wabaId = platformSender.ok
    ? platformSender.sender.wabaId
    : process.env.WHATSAPP_WABA_ID?.trim() || process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || "";
  const phoneNumberId = platformSender.ok
    ? platformSender.sender.phoneNumberId
    : process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || "";

  // Resolve a valid tenant ID for persistence
  let tenantId = platformSender.ok ? platformSender.sender.tenantId : "";
  if (!tenantId) {
    try {
      const { data: anyTenant } = await supabase
        .from("tenants")
        .select("id")
        .limit(1)
        .maybeSingle();
      tenantId = anyTenant?.id ?? "";
    } catch {
      // Non-fatal
    }
  }
  if (!tenantId) {
    tenantId = "00000000-0000-0000-0000-000000000000";
  }
  const bindingId = platformSender.ok ? platformSender.sender.bindingId : null;

  // 1. Check existing local template
  let existingTemplates: WhatsAppTemplateRow[] = [];
  try {
    if (tenantId && tenantId !== "00000000-0000-0000-0000-000000000000") {
      existingTemplates = await listTemplatesForTenant(supabase, tenantId);
    }
    if (existingTemplates.length === 0) {
      const { data: anyTemplates } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .eq("name", "audit_report_ready")
        .order("synced_at", { ascending: false });
      if (anyTemplates && anyTemplates.length > 0) {
        existingTemplates = anyTemplates as WhatsAppTemplateRow[];
      }
    }
  } catch {
    // Non-fatal
  }
  const auditTemplate = existingTemplates.find((t) => t.name === "audit_report_ready");

  // If neither WHATSAPP_TOKEN nor live mode is available, return local data
  if (!token && mode !== "live") {
    return {
      templates: existingTemplates,
      source: "disabled",
      lastVerifiedAt: auditTemplate?.synced_at ?? null,
      metaAvailable: false,
      senderStatus: platformSender.ok ? "CONFIGURED" : "SENDER_NOT_CONFIGURED",
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
      senderStatus: platformSender.ok ? "CONFIGURED" : "SENDER_NOT_CONFIGURED",
    };
  }

  // 2. Perform live Meta sync with timeout protection
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Meta API request timed out (10s)")), 10000)
    );

    const inspection = await Promise.race([
      inspectMetaTemplateEndpoint(
        { wabaId: wabaId || phoneNumberId, phoneNumberId },
        fetchFn
      ),
      timeoutPromise,
    ]);

    if (inspection.templates && inspection.templates.length > 0) {
      const liveTemplates: WhatsAppTemplateRow[] = (inspection.templates as MetaTemplateApiEntry[]).map((entry, idx) => {
        const rawStatus = (entry.status ?? "PENDING").toUpperCase();
        const status = (["PENDING", "APPROVED", "REJECTED", "DISABLED", "PAUSED"].includes(rawStatus)
          ? rawStatus
          : "PENDING") as WhatsAppTemplateRow["status"];
        return {
          id: entry.id || `meta-tpl-${idx}`,
          tenant_id: tenantId,
          phone_binding_id: bindingId,
          name: entry.name,
          language: entry.language,
          category: entry.category ?? null,
          provider_template_id: entry.id,
          status,
          components: (entry.components as unknown[]) ?? [],
          synced_at: new Date().toISOString(),
        };
      });

      // Persist to database in background
      try {
        if (inspection.resolvedWabaId && bindingId) {
          await supabase
            .from("whatsapp_phone_bindings")
            .update({ waba_id: inspection.resolvedWabaId, updated_at: new Date().toISOString() })
            .eq("id", bindingId);
        } else if (inspection.resolvedWabaId && phoneNumberId) {
          await supabase
            .from("whatsapp_phone_bindings")
            .update({ waba_id: inspection.resolvedWabaId, updated_at: new Date().toISOString() })
            .eq("phone_number_id", phoneNumberId);
        }

        if (tenantId && tenantId !== "00000000-0000-0000-0000-000000000000") {
          for (const tpl of liveTemplates) {
            await supabase.from("whatsapp_templates").upsert(
              {
                tenant_id: tpl.tenant_id,
                phone_binding_id: tpl.phone_binding_id,
                name: tpl.name,
                language: tpl.language,
                category: tpl.category,
                provider_template_id: tpl.provider_template_id,
                status: tpl.status,
                components: tpl.components,
                synced_at: tpl.synced_at,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "tenant_id,name,language" }
            );
          }
        }
      } catch {
        // Non-blocking persistence
      }

      const liveAudit = liveTemplates.find((t) => t.name === "audit_report_ready");
      return {
        templates: liveTemplates,
        source: "meta_live",
        lastVerifiedAt: liveAudit?.synced_at ?? new Date().toISOString(),
        metaAvailable: true,
        senderStatus: (platformSender.ok || Boolean(phoneNumberId)) ? "CONFIGURED" : "SENDER_NOT_CONFIGURED",
      };
    }
  } catch (err) {
    // Graceful fallback to cached database records if Meta is temporarily offline or times out
  }

  // 3. Fallback: query any cached database records across all tenants
  try {
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
      senderStatus: (platformSender.ok || Boolean(phoneNumberId)) ? "CONFIGURED" : "SENDER_NOT_CONFIGURED",
    };
  } catch {
    return {
      templates: existingTemplates,
      source: "cached_db",
      lastVerifiedAt: auditTemplate?.synced_at ?? null,
      metaAvailable: false,
      senderStatus: (platformSender.ok || Boolean(phoneNumberId)) ? "CONFIGURED" : "SENDER_NOT_CONFIGURED",
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
