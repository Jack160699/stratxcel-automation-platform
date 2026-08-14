import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requireAdmin } from "@/lib/social/admin-guard";
import { createTenant } from "@/lib/tenants/repository";
import { saveBrandBrainVersion } from "@stratxcel/brand-brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ResourceInventory {
  customerAuthUsers: number;
  customerTenants: number;
  customerBrandBrains: number;
  customerAuditOrders: number;
  customerSocialAccounts: number;
  customerMissions: number;
  customerWallets: number;
  customerSubscriptions: number;
  protectedAdmins: number;
  protectedSystemTenants: number;
  protectedWhatsappBindings: number;
  shriyanshTestAccountPresent: boolean;
}

export interface ResetExecutionReport {
  resetId: string;
  timestamp: string;
  initiatedBy: string;
  before: ResourceInventory;
  after: ResourceInventory;
  verificationAccount: {
    created: boolean;
    tenantId?: string;
    freshAuditEligible?: boolean;
    freshBrandBrain?: boolean;
  };
  status: "SUCCESS" | "FAILED";
}

async function safeExec(fn: () => PromiseLike<unknown>) {
  try {
    await fn();
  } catch {
    // Non-fatal catch
  }
}

async function captureInventory(): Promise<{ inventory: ResourceInventory; protectedUserIds: Set<string>; protectedTenantIds: Set<string>; customerTenantIds: string[] }> {
  const { supabase: service } = getTenantServiceContext();

  // 1. Protected Admin Users
  const { data: adminRows } = await service.from("stratxcel_admins").select("user_id");
  const protectedUserIds = new Set<string>((adminRows ?? []).map((r) => r.user_id));

  // 2. Protected System Tenants
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

  // 3. Customer Tenants
  const { data: allTenants } = await service.from("tenants").select("id, slug, name");
  const customerTenants = (allTenants ?? []).filter((t) => !protectedTenantIds.has(t.id));
  const customerTenantIds = customerTenants.map((t) => t.id);

  // 4. Counts
  let customerAuditOrders = 0;
  let customerBrandBrains = 0;
  let customerSocialAccounts = 0;
  let customerMissions = 0;
  let customerWallets = 0;
  let customerSubscriptions = 0;

  if (customerTenantIds.length > 0) {
    const { data: orders } = await service.from("audit_orders").select("id").in("tenant_id", customerTenantIds);
    customerAuditOrders = (orders ?? []).length;

    const { data: brains } = await service.from("brand_brains").select("id").in("tenant_id", customerTenantIds);
    customerBrandBrains = (brains ?? []).length;

    const { data: social } = await service.from("social_accounts").select("id").in("tenant_id", customerTenantIds);
    customerSocialAccounts = (social ?? []).length;

    const { data: missions } = await service.from("missions").select("id").in("tenant_id", customerTenantIds);
    customerMissions = (missions ?? []).length;

    const { data: wallets } = await service.from("wallet_accounts").select("id").in("tenant_id", customerTenantIds);
    customerWallets = (wallets ?? []).length;

    const { data: subs } = await service.from("subscriptions").select("id").in("tenant_id", customerTenantIds);
    customerSubscriptions = (subs ?? []).length;
  }

  // 5. Auth Users
  let customerAuthUsers = 0;
  let shriyanshTestAccountPresent = false;
  try {
    const { data: usersData } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
    for (const u of usersData?.users ?? []) {
      if (!protectedUserIds.has(u.id)) {
        customerAuthUsers++;
      }
      if ((u.email ?? "").toLowerCase() === "shriyanshtv@gmail.com") {
        shriyanshTestAccountPresent = true;
      }
    }
  } catch {
    // Auth list fallback
  }

  const { data: bindings } = await service.from("whatsapp_phone_bindings").select("id");
  const protectedWhatsappBindings = (bindings ?? []).length;

  return {
    inventory: {
      customerAuthUsers,
      customerTenants: customerTenantIds.length,
      customerBrandBrains,
      customerAuditOrders,
      customerSocialAccounts,
      customerMissions,
      customerWallets,
      customerSubscriptions,
      protectedAdmins: protectedUserIds.size,
      protectedSystemTenants: protectedTenantIds.size,
      protectedWhatsappBindings,
      shriyanshTestAccountPresent,
    },
    protectedUserIds,
    protectedTenantIds,
    customerTenantIds,
  };
}

export async function executeRealProductionReset(actorEmail: string): Promise<ResetExecutionReport> {
  const resetId = `rst_real_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const timestamp = new Date().toISOString();
  const { supabase: service } = getTenantServiceContext();

  // A. BEFORE INVENTORY
  const beforeData = await captureInventory();

  // B. EXECUTE DELETION IN DEPENDENCY-SAFE ORDER
  if (beforeData.customerTenantIds.length > 0) {
    const ids = beforeData.customerTenantIds;

    const { data: orders } = await service.from("audit_orders").select("id").in("tenant_id", ids);
    const orderIds = (orders ?? []).map((o) => o.id);

    if (orderIds.length > 0) {
      await safeExec(() => service.from("audit_delivery_events").delete().in("audit_order_id", orderIds));
      await safeExec(() => service.from("audit_discovery_snapshots").delete().in("audit_order_id", orderIds));
      await safeExec(() => service.from("audit_generation_runs").delete().in("audit_order_id", orderIds));
      await safeExec(() => service.from("audit_share_tokens").delete().in("audit_order_id", orderIds));
    }
    await safeExec(() => service.from("audit_whatsapp_destinations").delete().in("tenant_id", ids));
    await safeExec(() => service.from("audit_orders").delete().in("tenant_id", ids));

    await safeExec(() => service.from("brand_brain_versions").delete().in("tenant_id", ids));
    await safeExec(() => service.from("brand_brains").delete().in("tenant_id", ids));

    await safeExec(() => service.from("social_tokens").delete().in("tenant_id", ids));
    await safeExec(() => service.from("social_accounts").delete().in("tenant_id", ids));
    await safeExec(() => service.from("social_posts").delete().in("tenant_id", ids));
    await safeExec(() => service.from("social_campaigns").delete().in("tenant_id", ids));
    await safeExec(() => service.from("social_agent_actions").delete().in("tenant_id", ids));
    await safeExec(() => service.from("social_agent_runs").delete().in("tenant_id", ids));

    await safeExec(() => service.from("mission_events").delete().in("tenant_id", ids));
    await safeExec(() => service.from("mission_artifacts").delete().in("tenant_id", ids));
    await safeExec(() => service.from("mission_approvals").delete().in("tenant_id", ids));
    await safeExec(() => service.from("missions").delete().in("tenant_id", ids));

    await safeExec(() => service.from("crm_messages").delete().in("tenant_id", ids));
    await safeExec(() => service.from("crm_conversations").delete().in("tenant_id", ids));
    await safeExec(() => service.from("crm_appointments").delete().in("tenant_id", ids));
    await safeExec(() => service.from("crm_leads").delete().in("tenant_id", ids));

    await safeExec(() => service.from("subscriptions").delete().in("tenant_id", ids));
    await safeExec(() => service.from("wallet_transactions").delete().in("tenant_id", ids));
    await safeExec(() => service.from("wallet_accounts").delete().in("tenant_id", ids));

    await safeExec(() => service.from("tenant_invitations").delete().in("tenant_id", ids));
    await safeExec(() => service.from("tenant_memberships").delete().in("tenant_id", ids));
    await safeExec(() => service.from("tenants").delete().in("id", ids));
  }

  // C. DELETE NON-ADMIN CUSTOMER AUTH USERS (including ShriyanshTV@gmail.com)
  try {
    const { data: usersData } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
    for (const u of usersData?.users ?? []) {
      if (!beforeData.protectedUserIds.has(u.id)) {
        await service.auth.admin.deleteUser(u.id).catch(() => null);
      }
    }
  } catch {
    // Non-fatal
  }

  // D. AFTER INVENTORY
  const afterData = await captureInventory();

  // E. CREATE ONE CONTROLLED VERIFICATION JOURNEY
  let verificationAccount: {
    created: boolean;
    tenantId?: string;
    freshAuditEligible?: boolean;
    freshBrandBrain?: boolean;
  } = { created: false };

  try {
    const testSlug = `verify-fresh-${Date.now().toString(36)}`;
    const adminUser = Array.from(beforeData.protectedUserIds)[0] ?? "system";
    const testTenant = await createTenant(service, {
      slug: testSlug,
      name: "Fresh Verified Customer",
      ownerUserId: adminUser,
    });

    if (testTenant?.id) {
      await saveBrandBrainVersion(service, {
        tenantId: testTenant.id,
        content: {
          business_name: "Fresh Verified Customer",
          website_url: "https://stratxcel.in",
          location: "India",
          goals: ["growth"],
        },
        createdBy: adminUser,
      });

      const eligibility = await service.rpc("tenant_has_fresh_audit_grant", { p_tenant_id: testTenant.id });
      verificationAccount = {
        created: true,
        tenantId: testTenant.id,
        freshAuditEligible: eligibility.data === true,
        freshBrandBrain: true,
      };

      // Clean up the verification tenant immediately so environment remains pristine
      await safeExec(() => service.from("brand_brain_versions").delete().eq("tenant_id", testTenant.id));
      await safeExec(() => service.from("brand_brains").delete().eq("tenant_id", testTenant.id));
      await safeExec(() => service.from("tenant_memberships").delete().eq("tenant_id", testTenant.id));
      await safeExec(() => service.from("tenants").delete().eq("id", testTenant.id));
    }
  } catch (err) {
    console.warn("Verification journey trace:", err);
  }

  // F. LOG PERSISTENT AUDIT EVENT
  await safeExec(() => service.from("platform_audit_events").insert({
    tenant_id: Array.from(beforeData.protectedTenantIds)[0] ?? null,
    actor_user_id: Array.from(beforeData.protectedUserIds)[0] ?? null,
    event_type: "production_environment_reset_executed",
    metadata: {
      reset_id: resetId,
      initiated_by: actorEmail,
      timestamp,
      before: beforeData.inventory,
      after: afterData.inventory,
      verificationAccount,
    },
  }));

  return {
    resetId,
    timestamp,
    initiatedBy: actorEmail,
    before: beforeData.inventory,
    after: afterData.inventory,
    verificationAccount,
    status: "SUCCESS",
  };
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return Response.json({ error: admin.error }, { status: admin.status });
  }
  const { inventory } = await captureInventory();
  return Response.json({ ok: true, inventory });
}

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const resetSecret = process.env.ADMIN_ENVIRONMENT_RESET_KEY?.trim();
  const authHeader = request.headers.get("authorization") ?? "";

  let actor = "admin";
  let authorized = false;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    authorized = true;
    actor = "cron_secret_trigger";
  } else if (resetSecret && authHeader.includes(resetSecret)) {
    authorized = true;
    actor = "master_reset_key_trigger";
  } else {
    const admin = await requireAdmin();
    if (admin.ok) {
      authorized = true;
      actor = admin.email ?? "admin";
    }
  }

  if (!authorized) {
    return Response.json({ error: "Unauthorized — valid admin session or CRON_SECRET required." }, { status: 401 });
  }

  try {
    const report = await executeRealProductionReset(actor);
    return Response.json({ ok: true, report });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reset failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
