import type { SupabaseClient } from "@supabase/supabase-js";
import { SYSTEM_TENANT_SLUGS } from "./constants.ts";

export { SYSTEM_TENANT_SLUGS };

export interface TenantClassification {
  isProtected: boolean;
  reason?: string;
}

/**
 * Checks if a tenant is a protected platform infrastructure tenant that must never be deleted
 * or exposed in the agency client list.
 */
export function classifyTenant(slug: string | null | undefined, tenantId?: string, protectedTenantIds?: Set<string>): TenantClassification {
  const normalizedSlug = (slug ?? "").trim().toLowerCase();

  if (SYSTEM_TENANT_SLUGS.has(normalizedSlug)) {
    return { isProtected: true, reason: "SYSTEM_PLATFORM_SLUG" };
  }

  if (tenantId && protectedTenantIds && protectedTenantIds.has(tenantId)) {
    return { isProtected: true, reason: "PLATFORM_INFRASTRUCTURE_BINDING" };
  }

  return { isProtected: false };
}

export function isProtectedPlatformTenant(slug: string | null | undefined, tenantId?: string, protectedTenantIds?: Set<string>): boolean {
  return classifyTenant(slug, tenantId, protectedTenantIds).isProtected;
}

async function safeExec(fn: () => PromiseLike<unknown>) {
  try {
    await fn();
  } catch {
    // Non-fatal error handling
  }
}

/**
 * Permanently and safely deletes all disposable data associated with a customer tenant
 * in dependency-safe foreign-key order, while completely preserving platform infrastructure.
 */
export async function deleteCustomerTenantData(
  service: SupabaseClient,
  tenantId: string,
  actorEmail = "admin"
): Promise<{ ok: boolean; error?: string; deletedTenantId?: string }> {
  // 1. Load tenant
  const { data: tenant, error: loadErr } = await service
    .from("tenants")
    .select("id, slug, name")
    .eq("id", tenantId)
    .maybeSingle();

  if (loadErr || !tenant) {
    return { ok: false, error: "TENANT_NOT_FOUND" };
  }

  // 2. Strict protection check
  if (isProtectedPlatformTenant(tenant.slug, tenant.id)) {
    return { ok: false, error: "PROTECTED_TENANT" };
  }

  // Check for platform WhatsApp sender binding
  const { data: bindings } = await service
    .from("whatsapp_phone_bindings")
    .select("id, outbound_enabled")
    .eq("tenant_id", tenantId)
    .eq("outbound_enabled", true);

  if ((bindings ?? []).length > 0) {
    return { ok: false, error: "PROTECTED_TENANT_WHATSAPP_SENDER" };
  }

  // 3. Delete disposable customer data in dependency-safe order
  // A. Audit Tables
  const { data: orders } = await service.from("audit_orders").select("id").eq("tenant_id", tenantId);
  const orderIds = (orders ?? []).map((o) => o.id);

  if (orderIds.length > 0) {
    await safeExec(() => service.from("audit_delivery_events").delete().in("audit_order_id", orderIds));
    await safeExec(() => service.from("audit_discovery_snapshots").delete().in("audit_order_id", orderIds));
    await safeExec(() => service.from("audit_generation_runs").delete().in("audit_order_id", orderIds));
    await safeExec(() => service.from("audit_share_tokens").delete().in("audit_order_id", orderIds));
  }
  await safeExec(() => service.from("audit_whatsapp_destinations").delete().eq("tenant_id", tenantId));
  await safeExec(() => service.from("audit_orders").delete().eq("tenant_id", tenantId));

  // B. Brand Brain Tables
  await safeExec(() => service.from("brand_brain_versions").delete().eq("tenant_id", tenantId));
  await safeExec(() => service.from("brand_brains").delete().eq("tenant_id", tenantId));

  // C. Social & Connectors
  await safeExec(() => service.from("social_tokens").delete().eq("tenant_id", tenantId));
  await safeExec(() => service.from("social_accounts").delete().eq("tenant_id", tenantId));
  await safeExec(() => service.from("social_posts").delete().eq("tenant_id", tenantId));
  await safeExec(() => service.from("social_campaigns").delete().eq("tenant_id", tenantId));
  await safeExec(() => service.from("social_agent_actions").delete().eq("tenant_id", tenantId));
  await safeExec(() => service.from("social_agent_runs").delete().eq("tenant_id", tenantId));

  // D. Missions & Hermes
  await safeExec(() => service.from("mission_events").delete().eq("tenant_id", tenantId));
  await safeExec(() => service.from("mission_artifacts").delete().eq("tenant_id", tenantId));
  await safeExec(() => service.from("mission_approvals").delete().eq("tenant_id", tenantId));
  await safeExec(() => service.from("missions").delete().eq("tenant_id", tenantId));

  // E. CRM
  await safeExec(() => service.from("crm_messages").delete().eq("tenant_id", tenantId));
  await safeExec(() => service.from("crm_conversations").delete().eq("tenant_id", tenantId));
  await safeExec(() => service.from("crm_appointments").delete().eq("tenant_id", tenantId));
  await safeExec(() => service.from("crm_leads").delete().eq("tenant_id", tenantId));

  // F. Subscriptions & Wallets
  await safeExec(() => service.from("subscriptions").delete().eq("tenant_id", tenantId));
  await safeExec(() => service.from("wallet_transactions").delete().eq("tenant_id", tenantId));
  await safeExec(() => service.from("wallet_accounts").delete().eq("tenant_id", tenantId));

  // G. Memberships & Tenant record
  // Find customer owner users (non-admin)
  const { data: adminRows } = await service.from("stratxcel_admins").select("user_id");
  const adminUserIds = new Set<string>((adminRows ?? []).map((r) => r.user_id));

  const { data: memberships } = await service
    .from("tenant_memberships")
    .select("user_id")
    .eq("tenant_id", tenantId);

  await safeExec(() => service.from("tenant_invitations").delete().eq("tenant_id", tenantId));
  await safeExec(() => service.from("tenant_memberships").delete().eq("tenant_id", tenantId));
  await safeExec(() => service.from("tenants").delete().eq("id", tenantId));

  // If customer user has no other tenants and is not admin, safely delete auth user so they can sign up fresh
  for (const m of memberships ?? []) {
    if (!adminUserIds.has(m.user_id)) {
      const { data: remaining } = await service
        .from("tenant_memberships")
        .select("tenant_id")
        .eq("user_id", m.user_id);

      if ((remaining ?? []).length === 0) {
        await service.auth.admin.deleteUser(m.user_id).catch(() => null);
      }
    }
  }

  // 4. Log deletion audit event
  await safeExec(() =>
    service.from("platform_audit_events").insert({
      tenant_id: tenantId,
      event_type: "admin_customer_deleted",
      metadata: {
        admin_user_id: actorEmail,
        target_tenant_id: tenant.id,
        target_tenant_slug: tenant.slug,
        target_tenant_name: tenant.name,
        timestamp: new Date().toISOString(),
        deletion_id: `del_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      },
    })
  );

  return { ok: true, deletedTenantId: tenantId };
}
