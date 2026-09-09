// Run with: node --experimental-strip-types packages/agent-core/src/__tests__/create-website-tool.test.ts
//
// create_website itself lives in lib/agent-core/website-tools.ts (Next.js
// app layer, imports the "@/..." path alias that only resolves inside the
// real Next.js build -- see lib/agent-core/__tests__/create-client-tool.test.ts's
// own header precedent for why app-layer tool files stay untested under
// plain `node --experimental-strip-types` and instead go through the app's
// own typecheck/build). What IS fully testable here, without that alias, is
// everything that actually determines whether the live WhatsApp Founder path
// can reach it: permission resolution (agent:mutate:website_create) and
// channel mutation policy (low_mutation -> confirm_required on whatsapp).
import assert from "node:assert/strict";
import { resolveStaffPermissions, resolveEffectiveStaffPermissions } from "../principals/repository.ts";
import { resolveAdminTools } from "../tools/registry.ts";
import { decideMutationPolicy } from "../policy/channel-policy.ts";
import { createActionConfirmation, consumeActionConfirmation } from "../confirmations/repository.ts";
import { createFakeSupabase } from "./support/fake-supabase.ts";
import type { AgentTool } from "../tools/contract.ts";
import type { StaffAgentPrincipal } from "../principal.ts";

const FAKE_CREATE_WEBSITE_TOOL: AgentTool = {
  schema: { name: "create_website", description: "test double", parameters: { type: "object", properties: {} } },
  mutating: true,
  risk: "low_mutation",
  requiredPermission: "agent:mutate:website_create",
  async execute() {
    return { outcome: "CREATED" };
  },
};

function staff(role: string, permissions: readonly string[]): StaffAgentPrincipal {
  return { kind: "staff", channel: "whatsapp", authUserId: `u-${role}`, tenantId: null, role, permissions };
}

function testOwnerHasThePermissionAdminDoesNot() {
  const ownerPerms = resolveStaffPermissions("platform_owner");
  const adminPerms = resolveStaffPermissions("platform_admin");
  assert.ok(ownerPerms.includes("agent:mutate:website_create"), "platform_owner must be granted agent:mutate:website_create");
  assert.ok(!adminPerms.includes("agent:mutate:website_create"), "platform_admin must NOT be granted agent:mutate:website_create -- Founder-only");
  console.log("create-website-tool.test.ts: agent:mutate:website_create is granted to platform_owner only — PASS");
}

function testCustomAccessProfileCannotExceedTheRoleCeiling() {
  // Defense in depth: even if platform_admin's own custom access profile
  // were misconfigured to request agent:mutate:website_create, the role
  // ceiling (resolveStaffPermissions(role)) must still strip it out -- a
  // profile can only narrow a role, never mint authority the role lacks.
  const effective = resolveEffectiveStaffPermissions("platform_admin", {
    access_profile: "custom",
    permission_grants: ["agent:mutate:website_create", "agent:read:website"],
    permission_denials: [],
  });
  assert.ok(!effective.includes("agent:mutate:website_create"), "a custom access profile must never exceed platform_admin's own role ceiling");
  assert.ok(effective.includes("agent:read:website"), "sanity: a legitimately-ceiling-permitted grant still passes through");
  console.log("create-website-tool.test.ts: a custom access profile cannot exceed the platform_admin role ceiling — PASS");
}

function testToolResolutionEndToEnd() {
  const owner = staff("platform_owner", resolveStaffPermissions("platform_owner"));
  const admin = staff("platform_admin", resolveStaffPermissions("platform_admin"));

  const ownerTools = resolveAdminTools(owner, { extraTools: [FAKE_CREATE_WEBSITE_TOOL] }).map((t) => t.schema.name);
  const adminTools = resolveAdminTools(admin, { extraTools: [FAKE_CREATE_WEBSITE_TOOL] }).map((t) => t.schema.name);

  assert.ok(ownerTools.includes("create_website"), "the Founder (platform_owner) must actually resolve create_website through the real registry");
  assert.ok(!adminTools.includes("create_website"), "platform_admin must never resolve create_website, even when it's offered as an extraTool");
  console.log("create-website-tool.test.ts: create_website resolves through resolveAdminTools for platform_owner only — PASS");
}

function testWhatsAppRequiresConfirmationBeforeExecuting() {
  const decision = decideMutationPolicy("whatsapp", "low_mutation");
  assert.deepEqual(decision, { action: "confirm_required" }, "create_website's low_mutation risk must resolve to confirm_required over WhatsApp -- one CONFIRM <code> before any AI spend/write");
  console.log("create-website-tool.test.ts: WhatsApp channel policy requires one CONFIRM before create_website executes — PASS");
}

async function testConfirmationBindsToCreateWebsiteAndCannotBeReplayed() {
  const { client } = createFakeSupabase();
  const supabase = client as any;

  const confirmation = await createActionConfirmation(supabase, {
    authUserId: "founder-1",
    channel: "whatsapp",
    actionName: "create_website",
    normalizedInput: { description: "a premium coffee shop in Raipur" },
  });

  // First CONFIRM <code>: binds to exactly this action + input.
  const first = await consumeActionConfirmation(supabase, "founder-1", confirmation.code);
  assert.equal(first.ok, true);
  if (first.ok) {
    assert.equal(first.actionName, "create_website");
    assert.deepEqual(first.normalizedInput, { description: "a premium coffee shop in Raipur" });
  }

  // Replaying the exact same code a second time must never execute again.
  const replay = await consumeActionConfirmation(supabase, "founder-1", confirmation.code);
  assert.equal(replay.ok, false);
  if (!replay.ok) assert.equal(replay.reason, "already_used", "a replayed create_website confirmation code must be rejected as already_used, never re-executed");

  // A different principal guessing/reusing the same code must also be rejected.
  const { client: client2 } = createFakeSupabase();
  const confirmation2 = await createActionConfirmation(client2 as any, {
    authUserId: "founder-1",
    channel: "whatsapp",
    actionName: "create_website",
    normalizedInput: { description: "a bakery in Bhilai" },
  });
  const impersonation = await consumeActionConfirmation(client2 as any, "someone-else", confirmation2.code);
  assert.equal(impersonation.ok, false);
  if (!impersonation.ok) assert.equal(impersonation.reason, "principal_mismatch");

  console.log("create-website-tool.test.ts: a create_website confirmation binds to the exact action+input, is Founder-bound, and cannot be replayed — PASS");
}

async function run() {
  testOwnerHasThePermissionAdminDoesNot();
  testCustomAccessProfileCannotExceedTheRoleCeiling();
  testToolResolutionEndToEnd();
  testWhatsAppRequiresConfirmationBeforeExecuting();
  await testConfirmationBindsToCreateWebsiteAndCannotBeReplayed();
}

run();
