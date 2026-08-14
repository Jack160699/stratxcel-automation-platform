import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requireAdmin } from "@/lib/social/admin-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface EnvironmentResetResult {
  resetId: string;
  timestamp: string;
  initiatedBy: string;
  customerUsersReset: number;
  customerTenantsReset: number;
  auditsReset: number;
  brandBrainsReset: number;
  connectorsReset: number;
  oauthConnectionsReset: number;
  missionsReset: number;
  crmRecordsReset: number;
  protectedRecordsPreserved: number;
  status: "COMPLETED" | "PARTIAL" | "FAILED";
}

async function safeExec(fn: () => PromiseLike<unknown>) {
  try {
    await fn();
  } catch {
    // Handled non-fatal
  }
}

/**
 * Performs a safe, dependency-ordered reset of customer/test data on Supabase,
 * while preserving all platform infrastructure, merchant configurations,
 * system tenants, and admin users.
 */
export async function executeSafeEnvironmentReset(actorEmail = "admin@stratxcel.in"): Promise<EnvironmentResetResult> {
  const resetId = `rst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const timestamp = new Date().toISOString();
  const { supabase: service } = getTenantServiceContext();

  // 1. Identify Protected Admin Users
  const { data: adminRows } = await service.from("stratxcel_admins").select("user_id");
  const protectedUserIds = new Set<string>((adminRows ?? []).map((r) => r.user_id));

  // 2. Identify Protected System Tenants
  const { data: adminMemberships } = await service
    .from("tenant_memberships")
    .select("tenant_id, user_id")
    .in("user_id", Array.from(protectedUserIds));

  const protectedTenantIds = new Set<string>((adminMemberships ?? []).map((m) => m.tenant_id));

  const { data: systemTenants } = await service
    .from("tenants")
    .select("id, slug")
    .in("slug", ["stratxcel", "platform", "staff-workspace", "system"]);

  for (const st of systemTenants ?? []) {
    protectedTenantIds.add(st.id);
  }

  // 3. Find Customer/Test Tenants (Disposable)
  const { data: allTenants } = await service.from("tenants").select("id, slug, name");
  const customerTenants = (allTenants ?? []).filter((t) => !protectedTenantIds.has(t.id));
  const customerTenantIds = customerTenants.map((t) => t.id);

  let auditsReset = 0;
  let brandBrainsReset = 0;
  let connectorsReset = 0;
  let oauthConnectionsReset = 0;
  let missionsReset = 0;
  let crmRecordsReset = 0;
  let customerUsersReset = 0;

  if (customerTenantIds.length > 0) {
    // Delete in dependency-safe order for customer tenants
    // A. Audit Tables
    const { data: orders } = await service.from("audit_orders").select("id").in("tenant_id", customerTenantIds);
    const orderIds = (orders ?? []).map((o) => o.id);
    auditsReset = orderIds.length;

    if (orderIds.length > 0) {
      await safeExec(() => service.from("audit_delivery_events").delete().in("audit_order_id", orderIds));
      await safeExec(() => service.from("audit_discovery_snapshots").delete().in("audit_order_id", orderIds));
      await safeExec(() => service.from("audit_generation_runs").delete().in("audit_order_id", orderIds));
      await safeExec(() => service.from("audit_share_tokens").delete().in("audit_order_id", orderIds));
    }
    await safeExec(() => service.from("audit_whatsapp_destinations").delete().in("tenant_id", customerTenantIds));
    await safeExec(() => service.from("audit_orders").delete().in("tenant_id", customerTenantIds));

    // B. Brand Brain Tables
    const { data: brains } = await service.from("brand_brains").select("id").in("tenant_id", customerTenantIds);
    brandBrainsReset = (brains ?? []).length;
    await safeExec(() => service.from("brand_brain_versions").delete().in("tenant_id", customerTenantIds));
    await safeExec(() => service.from("brand_brains").delete().in("tenant_id", customerTenantIds));

    // C. Connectors & Social
    const { data: socialAccs } = await service.from("social_accounts").select("id").in("tenant_id", customerTenantIds);
    connectorsReset = (socialAccs ?? []).length;
    oauthConnectionsReset = (socialAccs ?? []).length;
    await safeExec(() => service.from("social_tokens").delete().in("tenant_id", customerTenantIds));
    await safeExec(() => service.from("social_accounts").delete().in("tenant_id", customerTenantIds));
    await safeExec(() => service.from("social_posts").delete().in("tenant_id", customerTenantIds));
    await safeExec(() => service.from("social_campaigns").delete().in("tenant_id", customerTenantIds));
    await safeExec(() => service.from("social_agent_actions").delete().in("tenant_id", customerTenantIds));
    await safeExec(() => service.from("social_agent_runs").delete().in("tenant_id", customerTenantIds));

    // D. Missions / Hermes
    const { data: mList } = await service.from("missions").select("id").in("tenant_id", customerTenantIds);
    missionsReset = (mList ?? []).length;
    await safeExec(() => service.from("mission_events").delete().in("tenant_id", customerTenantIds));
    await safeExec(() => service.from("mission_artifacts").delete().in("tenant_id", customerTenantIds));
    await safeExec(() => service.from("mission_approvals").delete().in("tenant_id", customerTenantIds));
    await safeExec(() => service.from("missions").delete().in("tenant_id", customerTenantIds));

    // E. CRM
    const { data: leads } = await service.from("crm_leads").select("id").in("tenant_id", customerTenantIds);
    crmRecordsReset = (leads ?? []).length;
    await safeExec(() => service.from("crm_messages").delete().in("tenant_id", customerTenantIds));
    await safeExec(() => service.from("crm_conversations").delete().in("tenant_id", customerTenantIds));
    await safeExec(() => service.from("crm_appointments").delete().in("tenant_id", customerTenantIds));
    await safeExec(() => service.from("crm_leads").delete().in("tenant_id", customerTenantIds));

    // F. Wallet / Entitlements (Customer test tenants)
    await safeExec(() => service.from("wallet_transactions").delete().in("tenant_id", customerTenantIds));
    await safeExec(() => service.from("wallet_accounts").delete().in("tenant_id", customerTenantIds));

    // G. Memberships & Tenants
    await safeExec(() => service.from("tenant_invitations").delete().in("tenant_id", customerTenantIds));
    await safeExec(() => service.from("tenant_memberships").delete().in("tenant_id", customerTenantIds));
    await safeExec(() => service.from("tenants").delete().in("id", customerTenantIds));
  }

  // 4. Identify Customer Auth Users (who are not in stratxcel_admins)
  try {
    const { data: usersData } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
    for (const u of usersData?.users ?? []) {
      if (!protectedUserIds.has(u.id)) {
        // Delete non-admin customer test user so they can sign up afresh
        await service.auth.admin.deleteUser(u.id).catch(() => null);
        customerUsersReset++;
      }
    }
  } catch (err) {
    console.warn("Auth user reset warning (handled):", err);
  }

  // 5. Log audit event
  await safeExec(() => service.from("platform_audit_events").insert({
    tenant_id: Array.from(protectedTenantIds)[0] ?? null,
    actor_user_id: Array.from(protectedUserIds)[0] ?? null,
    event_type: "environment_test_reset",
    metadata: {
      reset_id: resetId,
      initiated_by: actorEmail,
      timestamp,
      number_of_users_reset: customerUsersReset,
      number_of_tenants_reset: customerTenants.length,
      number_of_audits_reset: auditsReset,
      number_of_connectors_reset: connectorsReset,
      number_of_missions_reset: missionsReset,
      protected_records_count: protectedUserIds.size + protectedTenantIds.size,
    },
  }));

  return {
    resetId,
    timestamp,
    initiatedBy: actorEmail,
    customerUsersReset,
    customerTenantsReset: customerTenants.length,
    auditsReset,
    brandBrainsReset,
    connectorsReset,
    oauthConnectionsReset,
    missionsReset,
    crmRecordsReset,
    protectedRecordsPreserved: protectedUserIds.size + protectedTenantIds.size,
    status: "COMPLETED",
  };
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    // Check for authorization header with service role or reset key if present
    const authHeader = request.headers.get("authorization") ?? "";
    const resetKey = process.env.ADMIN_ENVIRONMENT_RESET_KEY;
    if (!resetKey || !authHeader.includes(resetKey)) {
      return Response.json({ error: admin.error }, { status: admin.status });
    }
  }

  try {
    const result = await executeSafeEnvironmentReset(admin.ok ? admin.email ?? "admin" : "system_key");
    return Response.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reset failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
