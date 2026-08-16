import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("=== STRATXCEL REAL CONNECTION INVENTORY (READ-ONLY) ===");

  // 1. Tenants
  const { data: tenants, error: tErr } = await supabase
    .from("tenants")
    .select("id, name, created_at")
    .order("created_at", { ascending: true });

  console.log("\n1. TENANTS IN DATABASE:", tenants?.length ?? 0);
  if (tErr) console.error("Error fetching tenants:", tErr.message);
  else {
    for (const t of tenants ?? []) {
      console.log(` - ID: ${t.id} | Name: "${t.name}" | Created: ${t.created_at}`);
    }
  }

  // Find StratXcel Tenant if exists
  const stratxcelTenant = tenants?.find((t) =>
    t.name?.toLowerCase().includes("stratxcel")
  ) || tenants?.[0];

  const tenantId = stratxcelTenant?.id;
  console.log(`\nTARGET TENANT FOR DOGFOOD: ${stratxcelTenant?.name} (${tenantId})`);

  if (!tenantId) {
    console.log("No tenant found. Exiting inventory.");
    return;
  }

  // 2. Tenant Members
  const { data: members, error: mErr } = await supabase
    .from("tenant_members")
    .select("id, user_id, role, created_at")
    .eq("tenant_id", tenantId);

  console.log(`\n2. TENANT MEMBERS (${members?.length ?? 0}):`);
  if (mErr) console.error("Error fetching members:", mErr.message);
  else {
    for (const m of members ?? []) {
      console.log(` - User ID: ${m.user_id} | Role: ${m.role}`);
    }
  }

  // 3. Brand Brain
  const { data: bb, error: bbErr } = await supabase
    .from("brand_brain_versions")
    .select("id, version, is_active, created_at, content")
    .eq("tenant_id", tenantId)
    .order("version", { ascending: false })
    .limit(1);

  console.log(`\n3. BRAND BRAIN VERSIONS:`);
  if (bbErr) console.log("brand_brain_versions query:", bbErr.message);
  else if (bb && bb.length > 0) {
    const activeBb = bb[0];
    const content = activeBb.content || {};
    console.log(` - Active Version: ${activeBb.version}`);
    console.log(` - Business Name: ${content.business_name || content.name || "N/A"}`);
    console.log(` - Website: ${content.website_url || "N/A"}`);
    console.log(` - Channels: ${JSON.stringify(content.channels || content.online_profiles || [])}`);
  } else {
    console.log(" - No Brand Brain versions recorded for this tenant.");
  }

  // 4. Google Connections (search_google_connections)
  const { data: gConn, error: gErr } = await supabase
    .from("search_google_connections")
    .select("id, status, search_console_site_url, ga4_property_id, ga4_property_display_name, granted_scopes, connected_at, last_error")
    .eq("tenant_id", tenantId);

  console.log(`\n4. GOOGLE CONNECTIONS (Search Console & GA4):`);
  if (gErr) console.log("search_google_connections error:", gErr.message);
  else if (gConn && gConn.length > 0) {
    for (const g of gConn) {
      console.log(` - Status: ${g.status}`);
      console.log(` - Search Console Site: ${g.search_console_site_url || "None"}`);
      console.log(` - GA4 Property: ${g.ga4_property_display_name || g.ga4_property_id || "None"}`);
      console.log(` - Granted Scopes: ${JSON.stringify(g.granted_scopes)}`);
      console.log(` - Connected At: ${g.connected_at}`);
      if (g.last_error) console.log(` - Last Error: ${g.last_error}`);
    }
  } else {
    console.log(" - No search_google_connections record for this tenant.");
  }

  // 5. Social Accounts (social_accounts)
  const { data: sAccounts, error: sErr } = await supabase
    .from("social_accounts")
    .select("id, platform, username, display_name, status, token_health, permissions, last_sync_at")
    .eq("tenant_id", tenantId);

  console.log(`\n5. SOCIAL ACCOUNTS:`);
  if (sErr) console.log("social_accounts error:", sErr.message);
  else if (sAccounts && sAccounts.length > 0) {
    for (const s of sAccounts) {
      console.log(` - Platform: ${s.platform} | Username: ${s.username} | Display Name: ${s.display_name}`);
      console.log(`   Status: ${s.status} | Token Health: ${s.token_health}`);
      console.log(`   Permissions: ${JSON.stringify(s.permissions)}`);
      console.log(`   Last Sync: ${s.last_sync_at}`);
    }
  } else {
    console.log(" - No social_accounts records linked directly to this tenant_id.");
  }

  // Also check all social accounts globally to see if any exist under owner_id
  const { data: allSocial } = await supabase
    .from("social_accounts")
    .select("id, tenant_id, owner_id, platform, username, display_name, status");
  console.log(`\n5b. GLOBAL SOCIAL ACCOUNTS IN SYSTEM (${allSocial?.length ?? 0}):`);
  for (const s of allSocial ?? []) {
    console.log(` - [${s.platform}] ${s.display_name || s.username} (tenant: ${s.tenant_id}, status: ${s.status})`);
  }

  // 6. WhatsApp Phone Bindings
  const { data: waBindings, error: waErr } = await supabase
    .from("whatsapp_phone_bindings")
    .select("id, phone_e164, status, verification_status, created_at, updated_at")
    .eq("tenant_id", tenantId);

  console.log(`\n6. WHATSAPP PHONE BINDINGS:`);
  if (waErr) console.log("whatsapp_phone_bindings error:", waErr.message);
  else if (waBindings && waBindings.length > 0) {
    for (const w of waBindings) {
      const maskedPhone = w.phone_e164 ? w.phone_e164.slice(0, 4) + "****" + w.phone_e164.slice(-2) : "N/A";
      console.log(` - Phone: ${maskedPhone} | Status: ${w.status} | Verification: ${w.verification_status}`);
    }
  } else {
    console.log(" - No whatsapp_phone_bindings record for this tenant.");
  }

  // 7. Subscriptions / Plan Versions
  const { data: plans, error: pErr } = await supabase
    .from("plan_versions")
    .select("id, version, plan_tier, total_monthly_mrp_paise, status, billing_cycle_start, billing_cycle_end")
    .eq("tenant_id", tenantId);

  console.log(`\n7. PLAN VERSIONS:`);
  if (pErr) console.log("plan_versions error:", pErr.message);
  else if (plans && plans.length > 0) {
    for (const p of plans) {
      console.log(` - Plan Version: ${p.version} | Tier: ${p.plan_tier} | MRP: ₹${(p.total_monthly_mrp_paise / 100).toLocaleString('en-IN')} | Status: ${p.status}`);
      console.log(`   Cycle: ${p.billing_cycle_start} -> ${p.billing_cycle_end}`);
    }
  } else {
    console.log(" - No plan_versions record for this tenant.");
  }

  // 8. Business Evidence (Growth OS)
  const { data: evidence, error: evErr } = await supabase
    .from("business_evidence")
    .select("id, fact_category, fact_key, confidence, source, observed_at")
    .eq("tenant_id", tenantId);

  console.log(`\n8. BUSINESS EVIDENCE (Growth OS Normalized Facts):`);
  if (evErr) console.log("business_evidence error:", evErr.message);
  else if (evidence && evidence.length > 0) {
    console.log(` - Total Facts Stored: ${evidence.length}`);
    for (const ev of evidence.slice(0, 8)) {
      console.log(`   * [${ev.fact_category}] ${ev.fact_key} (conf: ${ev.confidence}, src: ${ev.source})`);
    }
    if (evidence.length > 8) console.log(`   * ... and ${evidence.length - 8} more facts.`);
  } else {
    console.log(" - No business_evidence records stored for this tenant.");
  }

  console.log("\n=== INVENTORY COMPLETE ===");
}

main().catch(err => {
  console.error("Inventory failed:", err);
  process.exit(1);
});
