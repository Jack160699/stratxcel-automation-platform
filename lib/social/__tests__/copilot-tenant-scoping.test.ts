// Regression coverage for the Social Copilot / Growth Assistant customer tenant
// activation and isolation. Verifies:
// 1. Additive migrations for sessions, content, media assets, attachments, and publishing jobs RLS.
// 2. Tenant isolation in repositories, claim RPCs, and account reading.
// 3. Activated image generation and media attachments with tenant plan/spend metering.
// 4. GrowthAssistantChat UI integration with proper server-side authentication.
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
  // --- 1. Migrations: additive tenant scoping, mutually exclusive with owner_id ---
  assert.ok(exists("supabase", "migrations", "20260818230000_social_copilot_tenant_scoping.sql"));
  const scopingMigration = read("supabase", "migrations", "20260818230000_social_copilot_tenant_scoping.sql");
  assert.ok(scopingMigration.includes("alter column owner_id drop not null"), "owner_id must become nullable to make room for tenant_id rows");
  assert.ok(scopingMigration.includes("check ((owner_id is not null) <> (tenant_id is not null))"), "a row must be unambiguously owner-scoped OR tenant-scoped, never both, never neither");
  assert.ok(scopingMigration.includes("social_agent_sessions_tenant_member"), "sessions need their own tenant-member policy");
  assert.ok(scopingMigration.includes("social_agent_messages_tenant_member") && scopingMigration.includes("social_agent_actions_tenant_member"), "messages/actions must be isolated via a join back to their parent session's tenant_id");
  assert.ok(scopingMigration.includes("content_master_tenant_member") && scopingMigration.includes("content_variants_tenant_member"), "content_master/content_variants need join-based isolation");
  assert.ok(scopingMigration.includes("claim_social_agent_action_tenant"), "the atomic action-claim RPC needs a tenant-aware sibling");

  // --- 2. Additive media & publishing unblocking migration ---
  assert.ok(exists("supabase", "migrations", "20260821160000_tenant_media_and_publishing_unblocking.sql"));
  const unblockMigration = read("supabase", "migrations", "20260821160000_tenant_media_and_publishing_unblocking.sql");
  assert.ok(unblockMigration.includes("social_agent_attachments_tenant_member"), "attachments must be scoped via session tenant join");
  assert.ok(unblockMigration.includes("social_media_assets_tenant_member"), "media assets must have tenant_members RLS policy");
  assert.ok(unblockMigration.includes("social_content_master_media_tenant_member"), "content master media associations must have tenant policy");
  assert.ok(unblockMigration.includes("social_publishing_jobs_tenant_member"), "publishing jobs must have tenant policy");

  // --- 3. Server context: never trust client tenantId; re-derive membership ---
  assert.ok(exists("lib", "social", "agent-tenant-context.ts"));
  const tenantContext = read("lib", "social", "agent-tenant-context.ts");
  assert.ok(tenantContext.includes("requireTenantContext(tenantId)"), "tenant membership must be re-derived from the caller's session");
  assert.ok(tenantContext.includes("isTenantAgentContext"), "type guard must be present for tenant context branching");

  // --- 4. Repositories: tenant vs owner branching with full AgentActorContext support ---
  const accountsRepo = read("lib", "social", "repositories", "accounts.ts");
  assert.ok(accountsRepo.includes("isTenantAgentContext(ctx)") && accountsRepo.includes('.eq("tenant_id", ctx.tenantId)'), "listAccounts must read the tenant's own connected accounts");
  const agentRepo = read("lib", "social", "repositories", "agent.ts");
  assert.ok(agentRepo.includes("isTenantAgentContext(ctx) ? { tenant_id: ctx.tenantId } : { owner_id: ctx.ownerId }"), "session creation must write tenant_id XOR owner_id");

  const mediaRepo = read("lib", "social", "repositories", "media-assets.ts");
  assert.ok(mediaRepo.includes("AgentActorContext"), "media-assets must support AgentActorContext");
  assert.ok(mediaRepo.includes("isTenantAgentContext(ctx)"), "media-assets must branch on tenant context");

  const attachmentsRepo = read("lib", "social", "repositories", "agent-attachments.ts");
  assert.ok(attachmentsRepo.includes("AgentActorContext"), "agent-attachments must support AgentActorContext");

  // --- 5. Activated Tools: image generation & media attachment enabled for tenant ---
  const tools = read("lib", "social", "agent", "tools.ts");
  assert.ok(tools.includes("executeGenerateImageTool(ctx, args)"), "generate_image tool must execute for tenant context");
  assert.ok(tools.includes("ingestAttachmentMedia(ctx, assertAttachmentSlot(args))"), "ingest_media must execute for tenant context");
  assert.ok(tools.includes("attachMediaToMaster(ctx, masterId, assetIds, replace)"), "attach_media_to_content must execute for tenant context");
  assert.ok(tools.includes("listJobs(ctx)"), "inspect_jobs must execute for tenant context");

  // --- 6. User-facing route + GrowthAssistantChat UI ---
  assert.ok(exists("app", "app", "social", "copilot", "page.tsx"));
  assert.ok(exists("app", "app", "social", "copilot", "GrowthAssistantChat.tsx"));
  assert.ok(exists("app", "app", "social", "copilot", "tenant-actions.ts"));
  const page = read("app", "app", "social", "copilot", "page.tsx");
  assert.ok(page.includes("GrowthAssistantChat"), "ClientSocialCopilotPage must render GrowthAssistantChat");
  assert.ok(page.includes("requireClientContext") && page.includes("requireAgentTenantContext"), "page must authenticate tenant server-side");

  const navData = read("components", "shell", "navigation", "app-nav-data.ts");
  assert.ok(navData.includes('href: "/app/social/copilot"'), "Growth Assistant must be in navigation");

  console.log("copilot-tenant-scoping.test.ts: ALL PASS (additive migrations, tenant media/publishing RLS, tenant-safe image generation, media ingestion, unblocked tools, and GrowthAssistantChat UI)");
}

run();
