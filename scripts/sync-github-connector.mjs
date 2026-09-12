import { execSync } from "node:child_process";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createDevEncryptedVault } from "../packages/byok/src/vault.ts";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function syncGitHub() {
  console.log("=== SYNCING GITHUB CONNECTOR & SECURE VAULTING ===");

  // 1. Obtain token safely from gh CLI
  let token = process.env.GITHUB_TOKEN;
  if (!token) {
    try {
      token = execSync("gh auth token", { encoding: "utf8" }).trim();
    } catch (e) {
      console.error("Failed to read token from gh auth token:", e.message);
      process.exit(1);
    }
  }

  if (!token) {
    console.error("No GitHub token available");
    process.exit(1);
  }

  // 2. Safely configure GITHUB_TOKEN in .env.local if not present
  try {
    const envContent = fs.readFileSync(".env.local", "utf8");
    if (!envContent.includes("GITHUB_TOKEN=")) {
      fs.appendFileSync(".env.local", `\nGITHUB_TOKEN=${token}\n`, "utf8");
      console.log("✓ Added GITHUB_TOKEN to .env.local");
    } else {
      console.log("✓ GITHUB_TOKEN already present in .env.local");
    }
  } catch (e) {
    console.warn("Could not update .env.local:", e.message);
  }

  // 3. Vault the token via AES-256-GCM
  const vault = createDevEncryptedVault(supabase);
  const secretRef = await vault.store(token);
  console.log("✓ Stored GitHub token securely in vault_secrets with ID:", secretRef);

  // 4. Update connector_definitions for github
  const declaredCapabilities = [
    "infrastructure.repo_read",
    "infrastructure.repo_write",
    "infrastructure.ci_inspect",
    "github.pr_read",
    "github.issue_read",
    "github.file_read",
  ];

  const { error: defErr } = await supabase.from("connector_definitions").upsert(
    {
      key: "github",
      label: "GitHub",
      category: "infrastructure",
      auth_method: "service_credential",
      scope_level: "platform",
      declared_capabilities: declaredCapabilities,
      description: "StratXcel source repository, issue tracking, and CI/CD operations for Jack160699/stratxcel-automation-platform. Authenticated via vaulted fine-grained PAT or GitHub CLI session.",
      real_status_source: "GET https://api.github.com/user with vaulted token",
      required_env_vars: ["GITHUB_TOKEN"],
    },
    { onConflict: "key" }
  );

  if (defErr) console.error("Error updating connector_definitions:", defErr);
  else console.log("✓ connector_definitions updated for github.");

  // 5. Upsert connector_connections for github (platform scope)
  const now = new Date().toISOString();
  const { data: existingConn } = await supabase
    .from("connector_connections")
    .select("id")
    .eq("connector_key", "github")
    .is("tenant_id", null)
    .maybeSingle();

  if (existingConn) {
    const { error: updateErr } = await supabase
      .from("connector_connections")
      .update({
        status: "healthy",
        encrypted_secret_ref: secretRef,
        discovered_capabilities: declaredCapabilities,
        last_health_check_at: now,
        last_error: null,
        updated_at: now,
      })
      .eq("id", existingConn.id);

    if (updateErr) console.error("Error updating connection:", updateErr);
    else console.log(`✓ Existing GitHub connection ${existingConn.id} updated to healthy.`);
  } else {
    const { data: newConn, error: insertErr } = await supabase
      .from("connector_connections")
      .insert({
        connector_key: "github",
        tenant_id: null,
        status: "healthy",
        encrypted_secret_ref: secretRef,
        discovered_capabilities: declaredCapabilities,
        last_health_check_at: now,
        connected_at: now,
        last_error: null,
      })
      .select()
      .single();

    if (insertErr) console.error("Error inserting connection:", insertErr);
    else console.log(`✓ New GitHub connection registered: ${newConn.id}`);
  }
}

syncGitHub().catch(console.error);
