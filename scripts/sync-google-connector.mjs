import { createClient } from "@supabase/supabase-js";
import { CONNECTOR_REGISTRY } from "../packages/connectors/src/registry.ts";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function syncGoogleConnector() {
  console.log("=== SYNCING GOOGLE CONNECTOR DEFINITION & PLATFORM CONNECTION ===");

  const googleDef = CONNECTOR_REGISTRY.find((c) => c.key === "google");
  if (!googleDef) throw new Error("google definition not found in CONNECTOR_REGISTRY");

  // 1. Upsert connector_definition with exact DB columns
  const { error: defErr } = await supabase.from("connector_definitions").upsert(
    {
      key: googleDef.key,
      label: googleDef.label,
      category: googleDef.category,
      auth_method: googleDef.authMethod,
      scope_level: googleDef.scopeLevel,
      declared_capabilities: googleDef.declaredCapabilities,
      description: googleDef.description,
      real_status_source: googleDef.realStatusSource,
      required_env_vars: googleDef.requiredEnvVars,
    },
    { onConflict: "key" }
  );

  if (defErr) {
    console.error("Failed to upsert google connector definition:", defErr);
    process.exit(1);
  }
  console.log("✓ Google connector definition synced to DB.");

  // 2. Check existing connection row for google with tenant_id IS NULL
  const { data: existingConn } = await supabase
    .from("connector_connections")
    .select("*")
    .eq("connector_key", "google")
    .is("tenant_id", null)
    .maybeSingle();

  const now = new Date().toISOString();
  const discoveredCapabilities = [
    "gemini.chat",
    "aistudio.prompt",
    "drive.browse",
    "drive.download",
    "drive.upload",
    "cloud.console_browse",
    "colab.notebook",
    "jules.task",
  ];

  const metadata = {
    authenticatedGoogleAccount: "shriyanshtv@gmail.com",
    accountEmail: "shriyanshtv@gmail.com",
    provider: "Google (Founder Session)",
    authMethod: "founder_browser_session",
    runtimeHostRef: "aws-ec2:i-0067f6c0dfd60cc46",
    verifiedCapabilities: discoveredCapabilities,
    lastVerifiedAt: now,
  };

  if (existingConn) {
    console.log(`Found existing connection row ${existingConn.id}, updating status to healthy...`);
    const { error: updateErr } = await supabase
      .from("connector_connections")
      .update({
        status: "healthy",
        discovered_capabilities: discoveredCapabilities,
        last_health_check_at: now,
        last_error: null,
        encrypted_secret_ref: `meta:${JSON.stringify(metadata)}`,
        updated_at: now,
      })
      .eq("id", existingConn.id);

    if (updateErr) {
      console.error("Error updating connection:", updateErr);
      process.exit(1);
    }
    console.log("✓ Existing Google connection updated to healthy.");
  } else {
    console.log("Registering new platform-scoped Google connector connection...");
    const { data: newConn, error: insertErr } = await supabase
      .from("connector_connections")
      .insert({
        connector_key: "google",
        tenant_id: null,
        status: "healthy",
        discovered_capabilities: discoveredCapabilities,
        last_health_check_at: now,
        connected_at: now,
        encrypted_secret_ref: `meta:${JSON.stringify(metadata)}`,
        last_error: null,
      })
      .select()
      .single();

    if (insertErr) {
      console.error("Error inserting connection:", insertErr);
      process.exit(1);
    }
    console.log(`✓ New Google connection registered: ${newConn.id}`);
  }
}

syncGoogleConnector().catch(console.error);
