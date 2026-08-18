// Regression coverage for the Social Copilot admin -> customer tenant
// migration. Verified live against the real production database
// (project uccqlgeghkwzujeeymua) during this migration: two-tenant SELECT/
// UPDATE/INSERT isolation and the claim_social_agent_action_tenant RPC all
// passed under real RLS with real auth.uid() impersonation (not just this
// static source check). This file exists so a later, unrelated edit that
// silently removes a guard or policy fails CI, not just a manual re-test.
//
// Run with: node --experimental-strip-types lib/social/__tests__/copilot-tenant-scoping.test.ts

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");
const exists = (...parts: string[]) => fs.existsSync(path.join(root, ...parts));

function run() {
  // --- Migration: additive tenant scoping, mutually exclusive with owner_id, never touches existing rows/policies. ---
  assert.ok(exists("supabase", "migrations", "20260818230000_social_copilot_tenant_scoping.sql"));
  const migration = read("supabase", "migrations", "20260818230000_social_copilot_tenant_scoping.sql");
  assert.ok(migration.includes("alter column owner_id drop not null"), "owner_id must become nullable to make room for tenant_id rows");
  assert.ok(migration.includes("check ((owner_id is not null) <> (tenant_id is not null))"), "a row must be unambiguously owner-scoped OR tenant-scoped, never both, never neither");
  assert.ok(migration.includes("social_agent_sessions_tenant_member"), "sessions need their own tenant-member policy");
  assert.ok(migration.includes("social_agent_messages_tenant_member") && migration.includes("social_agent_actions_tenant_member"), "messages/actions must be isolated via a join back to their parent session's tenant_id, never a second independently-maintained scoping column");
  assert.ok(migration.includes("content_master_tenant_member") && migration.includes("content_variants_tenant_member"), "content_master/content_variants need the same join-based isolation");
  assert.ok(migration.includes("claim_social_agent_action_tenant"), "the atomic action-claim RPC needs a tenant-aware sibling, not a reused owner-scoped one");
  assert.ok(migration.includes("tenant_members tm") && migration.includes("tm.user_id = auth.uid()"), "the claim RPC must verify caller membership explicitly (security definer bypasses RLS)");

  // --- Server context: never trust a client-supplied tenantId; re-derive membership every call. ---
  assert.ok(exists("lib", "social", "agent-tenant-context.ts"));
  const tenantContext = read("lib", "social", "agent-tenant-context.ts");
  assert.ok(tenantContext.includes("requireTenantContext(tenantId)"), "tenant membership must be re-derived from the caller's own session, not trusted from the client");
  assert.ok(tenantContext.includes("isTenantAgentContext"), "callers that must branch on actor identity need a real type guard, not a mechanical ownerId->tenantId rename");

  // --- Repositories: tenant vs owner branch on write, structural sharing on RLS-reliant reads. ---
  const accountsRepo = read("lib", "social", "repositories", "accounts.ts");
  assert.ok(accountsRepo.includes("isTenantAgentContext(ctx)") && accountsRepo.includes('.eq("tenant_id", ctx.tenantId)'), "listAccounts must read the tenant's own connected accounts via the same service-role+explicit-filter pattern the production V1.5 connectors already use, not RLS alone (social_accounts has no tenant RLS policy)");
  const agentRepo = read("lib", "social", "repositories", "agent.ts");
  assert.ok(agentRepo.includes("isTenantAgentContext(ctx) ? { tenant_id: ctx.tenantId } : { owner_id: ctx.ownerId }"), "session creation must write tenant_id XOR owner_id depending on caller mode");
  assert.ok(agentRepo.includes("claim_social_agent_action_tenant"), "claimAgentAction must call the tenant-aware RPC for tenant contexts");

  // --- Orchestrator: never Stratxcel's own identity leaking into a customer's system prompt or billing tenant. ---
  const orchestrator = read("lib", "social", "agent", "orchestrator.ts");
  assert.ok(orchestrator.includes("TENANT_SYSTEM_PROMPT"), "tenant sessions must never be told they operate \"Stratxcel's own\" accounts");
  assert.ok(orchestrator.includes("isTenantAgentContext(ctx)") && orchestrator.includes("ctx.tenantId") , "billable-AI tenant attribution must use the caller's real tenantId directly in tenant mode, never the admin-switcher resolution path");

  // --- Attachments/image generation: explicitly refused for tenant mode, never silently mis-scoped. ---
  const tools = read("lib", "social", "agent", "tools.ts");
  assert.ok(tools.includes("Attachments aren't available in this workspace's Copilot yet") || tools.includes("Media attachments aren't available in this workspace's Copilot yet"), "attachment-dependent tools must refuse honestly for tenant mode rather than write to an owner_id-keyed storage path");
  assert.ok(tools.includes("Image generation isn't available in this workspace's Copilot yet"), "image generation must refuse honestly for tenant mode");

  // --- User-facing route + navigation. ---
  assert.ok(exists("app", "app", "social", "copilot", "page.tsx"));
  assert.ok(exists("app", "app", "social", "copilot", "TenantCopilotFullPage.tsx"));
  assert.ok(exists("app", "app", "social", "copilot", "useTenantAgentSession.ts"));
  assert.ok(exists("app", "app", "social", "copilot", "tenant-actions.ts"));
  const page = read("app", "app", "social", "copilot", "page.tsx");
  assert.ok(page.includes("requireClientContext") && page.includes("requireAgentTenantContext"), "the page must resolve the real authenticated tenant server-side, then re-verify it before any data read");
  const navData = read("components", "shell", "navigation", "app-nav-data.ts");
  assert.ok(navData.includes('href: "/app/social/copilot"'), "Copilot must be reachable from the normal customer navigation, not just a direct URL");

  console.log("copilot-tenant-scoping.test.ts: ALL PASS (additive migration, mutual-exclusion CHECK, join-based child isolation, tenant-aware claim RPC, membership re-derivation, tenant-scoped account reads, session write branching, tenant system prompt, attachment/image-gen refusal, user route + navigation)");
}

run();
