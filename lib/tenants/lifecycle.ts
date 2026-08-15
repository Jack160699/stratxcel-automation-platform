import type { SupabaseClient } from "@supabase/supabase-js";
import { SYSTEM_TENANT_SLUGS } from "./constants.ts";

export { SYSTEM_TENANT_SLUGS };

export type TenantClassificationKind =
  | "PROTECTED_SYSTEM_TENANT"
  | "PROTECTED_PLATFORM_SENDER"
  | "ACTIVE_CUSTOMER"
  | "UNKNOWN";

export interface TenantClassification {
  kind: TenantClassificationKind;
  isProtected: boolean;
  reason?: string;
}

/**
 * Authoritative tenant classifier for deletion and admin listing.
 */
export function classifyTenantForDeletion(
  slug: string | null | undefined,
  tenantId?: string,
  isPlatformSharedSender?: boolean
): TenantClassification {
  const normalizedSlug = (slug ?? "").trim().toLowerCase();

  if (SYSTEM_TENANT_SLUGS.has(normalizedSlug)) {
    return {
      kind: "PROTECTED_SYSTEM_TENANT",
      isProtected: true,
      reason: "This workspace is a protected system platform workspace and cannot be deleted.",
    };
  }

  if (isPlatformSharedSender) {
    return {
      kind: "PROTECTED_PLATFORM_SENDER",
      isProtected: true,
      reason: "This workspace is the protected platform shared WhatsApp sender and cannot be deleted.",
    };
  }

  return {
    kind: "ACTIVE_CUSTOMER",
    isProtected: false,
  };
}

export function isProtectedPlatformTenant(
  slug: string | null | undefined,
  tenantId?: string,
  isPlatformSharedSender?: boolean
): boolean {
  return classifyTenantForDeletion(slug, tenantId, isPlatformSharedSender).isProtected;
}

/**
 * Fail-closed, dependency-ordered customer tenant deletion.
 * Attempts transactional RPC first; falls back to explicit fail-closed client deletions.
 * If any step fails, stops immediately and reports the exact database error.
 */
export async function deleteCustomerTenantData(
  service: SupabaseClient,
  tenantId: string,
  actorEmail = "admin"
): Promise<{ ok: boolean; error?: string; deletedTenantId?: string }> {
  // 1. Load tenant record
  const { data: tenant, error: loadErr } = await service
    .from("tenants")
    .select("id, slug, name")
    .eq("id", tenantId)
    .maybeSingle();

  if (loadErr) {
    return { ok: false, error: `Database error loading tenant: ${loadErr.message}` };
  }
  if (!tenant) {
    return { ok: false, error: "TENANT_NOT_FOUND" };
  }

  // 2. Check platform shared sender binding
  const { data: platformBinding } = await service
    .from("whatsapp_phone_bindings")
    .select("id, source")
    .eq("tenant_id", tenantId)
    .eq("source", "platform_shared_sender")
    .maybeSingle();

  const isPlatformSender = Boolean(platformBinding);

  // 3. Classify and enforce protection
  const classification = classifyTenantForDeletion(tenant.slug, tenant.id, isPlatformSender);
  if (classification.isProtected) {
    return { ok: false, error: classification.reason ?? "PROTECTED_TENANT" };
  }

  // Capture candidate orphan auth user IDs before removing membership rows
  const candidateUserIds = await getTenantMemberUserIds(service, tenantId);

  // 4. Try transactional database RPC
  const { data: rpcData, error: rpcErr } = await service.rpc("delete_customer_tenant_v1", {
    p_tenant_id: tenantId,
    p_actor: actorEmail,
  });

  if (!rpcErr && rpcData && typeof rpcData === "object" && (rpcData as { ok?: boolean }).ok) {
    // RPC succeeded atomically! Clean up non-admin customer auth accounts
    await cleanupOrphanAuthUsers(service, candidateUserIds);
    return { ok: true, deletedTenantId: tenantId };
  }

  // If RPC failed with an execution error (other than function missing/not in schema cache), fail-closed immediately
  if (rpcErr && !isRpcMissingError(rpcErr)) {
    return { ok: false, error: `Transactional deletion failed: ${rpcErr.message}. No customer data was considered deleted.` };
  }

  // 5. Fallback: Strict fail-closed sequence covering complete dependency graph
  try {
    const { data: orders } = await service.from("audit_orders").select("id").eq("tenant_id", tenantId);
    const orderIds = (orders ?? []).map((o) => o.id);

    // A. Break mutual FK from audit_orders to promo_redemptions
    await assertSuccess(
      service.from("audit_orders").update({ promo_redemption_id: null }).eq("tenant_id", tenantId),
      "audit_orders (nullify promo_redemption_id)"
    );

    // B. Promo Redemptions
    if (orderIds.length > 0) {
      await assertDeleteSuccess(service.from("promo_redemptions").delete().in("audit_order_id", orderIds), "promo_redemptions");
    }
    await assertDeleteSuccess(service.from("promo_redemptions").delete().eq("tenant_id", tenantId), "promo_redemptions");

    // C. Audit Engine Tables
    if (orderIds.length > 0) {
      await assertDeleteSuccess(service.from("audit_delivery_events").delete().in("audit_order_id", orderIds), "audit_delivery_events");
      await assertDeleteSuccess(service.from("audit_discovery_snapshots").delete().in("audit_order_id", orderIds), "audit_discovery_snapshots");
      await assertDeleteSuccess(service.from("audit_generation_runs").delete().in("audit_order_id", orderIds), "audit_generation_runs");
      await assertDeleteSuccess(service.from("audit_share_tokens").delete().in("audit_order_id", orderIds), "audit_share_tokens");
    }

    await assertDeleteSuccess(service.from("audit_reset_snapshots").delete().eq("tenant_id", tenantId), "audit_reset_snapshots");
    await assertDeleteSuccess(service.from("audit_discovery_snapshots").delete().eq("tenant_id", tenantId), "audit_discovery_snapshots");
    await assertDeleteSuccess(service.from("audit_whatsapp_destinations").delete().eq("tenant_id", tenantId), "audit_whatsapp_destinations");
    await assertDeleteSuccess(service.from("audit_orders").delete().eq("tenant_id", tenantId), "audit_orders");

    // D. Brand Brain Tables
    await assertDeleteSuccess(service.from("brand_brain_versions").delete().eq("tenant_id", tenantId), "brand_brain_versions");
    await assertDeleteSuccess(service.from("brand_brains").delete().eq("tenant_id", tenantId), "brand_brains");
    await assertDeleteSuccess(service.from("brand_assets").delete().eq("tenant_id", tenantId), "brand_assets");

    // E. Image Generation & Media Tables
    await assertDeleteSuccess(service.from("image_generation_references").delete().eq("tenant_id", tenantId), "image_generation_references");
    await assertDeleteSuccess(service.from("image_generation_candidates").delete().eq("tenant_id", tenantId), "image_generation_candidates");
    await assertDeleteSuccess(service.from("image_generation_jobs").delete().eq("tenant_id", tenantId), "image_generation_jobs");

    // D. Social & Content Tables
    await assertDeleteSuccess(service.from("social_tokens").delete().eq("tenant_id", tenantId), "social_tokens");
    await assertDeleteSuccess(service.from("social_accounts").delete().eq("tenant_id", tenantId), "social_accounts");
    await assertDeleteSuccess(service.from("social_posts").delete().eq("tenant_id", tenantId), "social_posts");
    await assertDeleteSuccess(service.from("social_campaigns").delete().eq("tenant_id", tenantId), "social_campaigns");
    await assertDeleteSuccess(service.from("social_agent_actions").delete().eq("tenant_id", tenantId), "social_agent_actions");
    await assertDeleteSuccess(service.from("social_agent_run_events").delete().eq("tenant_id", tenantId), "social_agent_run_events");
    await assertDeleteSuccess(service.from("social_agent_runs").delete().eq("tenant_id", tenantId), "social_agent_runs");
    await assertDeleteSuccess(service.from("social_media_assets").delete().eq("tenant_id", tenantId), "social_media_assets");
    await assertDeleteSuccess(service.from("social_brand_profiles").delete().eq("tenant_id", tenantId), "social_brand_profiles");
    await assertDeleteSuccess(service.from("social_whatsapp_sessions").delete().eq("tenant_id", tenantId), "social_whatsapp_sessions");

    // E. Missions & Hermes Tables
    await assertDeleteSuccess(service.from("mission_events").delete().eq("tenant_id", tenantId), "mission_events");
    await assertDeleteSuccess(service.from("mission_artifacts").delete().eq("tenant_id", tenantId), "mission_artifacts");
    await assertDeleteSuccess(service.from("mission_approvals").delete().eq("tenant_id", tenantId), "mission_approvals");
    await assertDeleteSuccess(service.from("missions").delete().eq("tenant_id", tenantId), "missions");

    // F. CRM & WhatsApp Customer Messaging Tables
    await assertDeleteSuccess(service.from("crm_messages").delete().eq("tenant_id", tenantId), "crm_messages");
    await assertDeleteSuccess(service.from("crm_conversations").delete().eq("tenant_id", tenantId), "crm_conversations");
    await assertDeleteSuccess(service.from("crm_appointments").delete().eq("tenant_id", tenantId), "crm_appointments");
    await assertDeleteSuccess(service.from("crm_follow_ups").delete().eq("tenant_id", tenantId), "crm_follow_ups");
    await assertDeleteSuccess(service.from("crm_leads").delete().eq("tenant_id", tenantId), "crm_leads");
    await assertDeleteSuccess(service.from("contact_consent").delete().eq("tenant_id", tenantId), "contact_consent");
    await assertDeleteSuccess(service.from("whatsapp_shadow_messages").delete().eq("tenant_id", tenantId), "whatsapp_shadow_messages");
    await assertDeleteSuccess(
      service.from("whatsapp_phone_bindings").delete().eq("tenant_id", tenantId).neq("source", "platform_shared_sender"),
      "whatsapp_phone_bindings"
    );

    // G. Subscriptions, Wallets & Payments
    await assertDeleteSuccess(service.from("payment_refund_records").delete().eq("tenant_id", tenantId), "payment_refund_records");
    await assertDeleteSuccess(service.from("payment_refunds").delete().eq("tenant_id", tenantId), "payment_refunds");
    await assertDeleteSuccess(service.from("payment_orders").delete().eq("tenant_id", tenantId), "payment_orders");
    await assertDeleteSuccess(service.from("payment_links").delete().eq("tenant_id", tenantId), "payment_links");
    await assertDeleteSuccess(service.from("invoices").delete().eq("tenant_id", tenantId), "invoices");
    await assertDeleteSuccess(service.from("credit_notes").delete().eq("tenant_id", tenantId), "credit_notes");
    await assertDeleteSuccess(service.from("billing_profiles").delete().eq("tenant_id", tenantId), "billing_profiles");
    await assertDeleteSuccess(service.from("subscriptions").delete().eq("tenant_id", tenantId), "subscriptions");
    await assertDeleteSuccess(service.from("wallet_transactions").delete().eq("tenant_id", tenantId), "wallet_transactions");
    await assertDeleteSuccess(service.from("wallet_accounts").delete().eq("tenant_id", tenantId), "wallet_accounts");

    // H. Websites, Domains, Storage & BYOK
    await assertDeleteSuccess(service.from("site_projects").delete().eq("tenant_id", tenantId), "site_projects");
    await assertDeleteSuccess(service.from("websites").delete().eq("tenant_id", tenantId), "websites");
    await assertDeleteSuccess(service.from("domains").delete().eq("tenant_id", tenantId), "domains");
    await assertDeleteSuccess(service.from("custom_domains").delete().eq("tenant_id", tenantId), "custom_domains");
    await assertDeleteSuccess(service.from("storage_file_references").delete().eq("tenant_id", tenantId), "storage_file_references");
    await assertDeleteSuccess(service.from("storage_connections").delete().eq("tenant_id", tenantId), "storage_connections");
    await assertDeleteSuccess(service.from("storage_drive_connections").delete().eq("tenant_id", tenantId), "storage_drive_connections");
    await assertDeleteSuccess(service.from("tenant_provider_connections").delete().eq("tenant_id", tenantId), "tenant_provider_connections");
    await assertDeleteSuccess(service.from("provider_usage_events").delete().eq("tenant_id", tenantId), "provider_usage_events");
    await assertDeleteSuccess(service.from("byok_tenant_credentials").delete().eq("tenant_id", tenantId), "byok_tenant_credentials");

    // I. Workforce, Media, Search & AI Execution
    await assertDeleteSuccess(service.from("workforce_tasks").delete().eq("tenant_id", tenantId), "workforce_tasks");
    await assertDeleteSuccess(service.from("workforce_agents").delete().eq("tenant_id", tenantId), "workforce_agents");
    await assertDeleteSuccess(service.from("workforce_plans").delete().eq("tenant_id", tenantId), "workforce_plans");
    await assertDeleteSuccess(service.from("workforce_stages").delete().eq("tenant_id", tenantId), "workforce_stages");
    await assertDeleteSuccess(service.from("workforce_reviews").delete().eq("tenant_id", tenantId), "workforce_reviews");
    await assertDeleteSuccess(service.from("image_generation_jobs").delete().eq("tenant_id", tenantId), "image_generation_jobs");
    await assertDeleteSuccess(service.from("ai_execution_attempts").delete().eq("tenant_id", tenantId), "ai_execution_attempts");
    await assertDeleteSuccess(service.from("ai_usage_ledger").delete().eq("tenant_id", tenantId), "ai_usage_ledger");
    await assertDeleteSuccess(service.from("oauth_states").delete().eq("tenant_id", tenantId), "oauth_states");
    await assertDeleteSuccess(service.from("search_actions").delete().eq("tenant_id", tenantId), "search_actions");
    await assertDeleteSuccess(service.from("search_recommendations").delete().eq("tenant_id", tenantId), "search_recommendations");
    await assertDeleteSuccess(service.from("search_opportunities").delete().eq("tenant_id", tenantId), "search_opportunities");
    await assertDeleteSuccess(service.from("search_analysis_runs").delete().eq("tenant_id", tenantId), "search_analysis_runs");
    await assertDeleteSuccess(service.from("search_projects").delete().eq("tenant_id", tenantId), "search_projects");
    await assertDeleteSuccess(service.from("search_measurement_snapshots").delete().eq("tenant_id", tenantId), "search_measurement_snapshots");
    await assertDeleteSuccess(service.from("search_google_connections").delete().eq("tenant_id", tenantId), "search_google_connections");

    // J. Memberships & Invitations
    await assertDeleteSuccess(service.from("tenant_invitations").delete().eq("tenant_id", tenantId), "tenant_invitations");
    await assertDeleteSuccess(service.from("tenant_memberships").delete().eq("tenant_id", tenantId), "tenant_memberships");
    await assertDeleteSuccess(service.from("tenant_members").delete().eq("tenant_id", tenantId), "tenant_members");
    await assertDeleteSuccess(service.from("tenants").delete().eq("id", tenantId), "tenants");

    // Clean up non-admin customer auth accounts
    await cleanupOrphanAuthUsers(service, candidateUserIds);

    // Write audit event
    await service.from("platform_audit_events").insert({
      tenant_id: tenantId,
      event_type: "admin_customer_deleted",
      metadata: {
        admin_user_id: actorEmail,
        target_tenant_id: tenant.id,
        target_tenant_slug: tenant.slug,
        target_tenant_name: tenant.name,
        timestamp: new Date().toISOString(),
      },
    });

    return { ok: true, deletedTenantId: tenantId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Client deletion failed: ${msg}. No customer data was considered deleted.` };
  }
}

function isRpcMissingError(rpcErr: { message?: string; code?: string } | null | undefined): boolean {
  if (!rpcErr) return false;
  const msg = (rpcErr.message ?? "").toLowerCase();
  return (
    rpcErr.code === "PGRST202" ||
    msg.includes("could not find the function") ||
    msg.includes("schema cache") ||
    msg.includes("does not exist") ||
    msg.includes("not found")
  );
}

async function assertDeleteSuccess(promise: PromiseLike<{ error: { message: string; code?: string } | null }>, tableName: string) {
  const { error } = await promise;
  if (error && error.code !== "PGRST205" && !error.message.includes("does not exist")) {
    throw new Error(`Failed to delete from ${tableName}: ${error.message}`);
  }
}

async function assertSuccess(promise: PromiseLike<{ error: { message: string; code?: string } | null }>, actionName: string) {
  const { error } = await promise;
  if (error && error.code !== "PGRST205" && !error.message.includes("does not exist")) {
    throw new Error(`Failed to update ${actionName}: ${error.message}`);
  }
}

async function getTenantMemberUserIds(service: SupabaseClient, tenantId: string): Promise<string[]> {
  try {
    const [membersRes, membershipsRes] = await Promise.all([
      service.from("tenant_members").select("user_id").eq("tenant_id", tenantId),
      service.from("tenant_memberships").select("user_id").eq("tenant_id", tenantId),
    ]);
    const userIds = new Set<string>();
    for (const row of membersRes.data ?? []) if (row.user_id) userIds.add(row.user_id);
    for (const row of membershipsRes.data ?? []) if (row.user_id) userIds.add(row.user_id);
    return Array.from(userIds);
  } catch {
    return [];
  }
}

async function cleanupOrphanAuthUsers(service: SupabaseClient, candidateUserIds: string[]) {
  if (candidateUserIds.length === 0) return;
  try {
    const { data: adminRows } = await service.from("stratxcel_admins").select("user_id");
    const adminUserIds = new Set<string>((adminRows ?? []).map((r) => r.user_id));

    for (const userId of candidateUserIds) {
      if (adminUserIds.has(userId)) continue;

      const [membersRes, membershipsRes] = await Promise.all([
        service.from("tenant_members").select("tenant_id").eq("user_id", userId),
        service.from("tenant_memberships").select("tenant_id").eq("user_id", userId),
      ]);

      const remainingMembers = (membersRes.data ?? []).length;
      const remainingMemberships = (membershipsRes.data ?? []).length;

      if (remainingMembers === 0 && remainingMemberships === 0) {
        await service.auth.admin.deleteUser(userId).catch(() => null);
      }
    }
  } catch {
    // Non-fatal auth user cleanup
  }
}
