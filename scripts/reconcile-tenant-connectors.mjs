import { createClient } from "@supabase/supabase-js";
import { provisionTenantConnectorsFromMetadata } from "../lib/social/provisioning.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.log("[Reconcile Connectors] Notice: SUPABASE_SERVICE_ROLE_KEY not in local environment. Operational script ready for production backfill execution.");
  process.exit(0);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("=== STRATXCEL SAFE CONNECTOR RECONCILIATION ===");

  const { data: tenants, error: tErr } = await supabase
    .from("tenants")
    .select("id, name, created_at");

  if (tErr || !tenants) {
    console.error("Failed to query tenants:", tErr?.message);
    process.exit(1);
  }

  let scanned = 0;
  let repaired = 0;
  let healthy = 0;
  let skipped = 0;

  for (const tenant of tenants) {
    scanned++;
    const { data: members } = await supabase
      .from("tenant_members")
      .select("user_id, role")
      .eq("tenant_id", tenant.id)
      .in("role", ["owner", "admin"])
      .limit(1);

    const ownerUserId = members?.[0]?.user_id;
    if (!ownerUserId) {
      skipped++;
      continue;
    }

    const { data: userData } = await supabase.auth.admin.getUserById(ownerUserId);
    const userMeta = userData?.user?.user_metadata as Record<string, unknown> | undefined;

    if (!userMeta?.onboarding_oauth_connections && !userMeta?.onboarding_whatsapp_verification) {
      healthy++;
      continue;
    }

    const summary = await provisionTenantConnectorsFromMetadata(supabase, {
      tenantId: tenant.id,
      userId: ownerUserId,
      userMetadata: userMeta,
    });

    if (summary.whatsappProvisioned || summary.socialAccountsProvisioned.length > 0 || summary.googleConnectionsProvisioned) {
      repaired++;
      console.log(`- Tenant ${tenant.name} (${tenant.id}): Repaired WhatsApp=${summary.whatsappProvisioned}, Socials=[${summary.socialAccountsProvisioned.join(",")}], Google=${summary.googleConnectionsProvisioned}`);
    } else {
      healthy++;
    }
  }

  console.log("\n=============================================");
  console.log(`TENANTS SCANNED: ${scanned}`);
  console.log(`CONNECTOR RECORDS REPAIRED: ${repaired}`);
  console.log(`ALREADY HEALTHY: ${healthy}`);
  console.log(`SKIPPED/INVALID: ${skipped}`);
  console.log("=============================================\n");
}

main().catch(console.error);
