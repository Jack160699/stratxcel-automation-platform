import assert from "node:assert/strict";
import {
  decideBrandAssignment,
  decideAccountAssignment,
  type AssignmentAuthority,
} from "../package-tenant-assignment.ts";

const staff: AssignmentAuthority = { actorUserId: "staff-1", isStaff: true, membershipRole: null };
const owner: AssignmentAuthority = { actorUserId: "owner-1", isStaff: false, membershipRole: "owner" };
const operator: AssignmentAuthority = { actorUserId: "op-1", isStaff: false, membershipRole: "operator" };
const viewer: AssignmentAuthority = { actorUserId: "view-1", isStaff: false, membershipRole: "viewer" };
const viewerClaimant: AssignmentAuthority = { actorUserId: "random-1", isStaff: false, membershipRole: "viewer" };

const tenantA = "tenant-a";
const tenantB = "tenant-b";

function run() {
  // Brand: staff success on unbound
  assert.deepEqual(
    decideBrandAssignment({
      authority: staff,
      profile: { id: "brand-1", owner_id: "other", tenant_id: null },
      targetTenantId: tenantA,
      explicitProfileId: true,
      tenantAlreadyHasOtherBrand: false,
    }),
    { allow: true, idempotent: false }
  );

  // Brand: owner success on own unbound profile
  assert.deepEqual(
    decideBrandAssignment({
      authority: owner,
      profile: { id: "brand-1", owner_id: "owner-1", tenant_id: null },
      targetTenantId: tenantA,
      explicitProfileId: false,
      tenantAlreadyHasOtherBrand: false,
    }),
    { allow: true, idempotent: false }
  );

  // Brand: same-tenant idempotent
  assert.deepEqual(
    decideBrandAssignment({
      authority: owner,
      profile: { id: "brand-1", owner_id: "owner-1", tenant_id: tenantA },
      targetTenantId: tenantA,
      explicitProfileId: false,
      tenantAlreadyHasOtherBrand: false,
    }),
    { allow: true, idempotent: true }
  );

  // Brand: cross-tenant reject
  assert.deepEqual(
    decideBrandAssignment({
      authority: staff,
      profile: { id: "brand-1", owner_id: "owner-1", tenant_id: tenantB },
      targetTenantId: tenantA,
      explicitProfileId: true,
      tenantAlreadyHasOtherBrand: false,
    }),
    { allow: false, reason: "cross_tenant_reassignment" }
  );

  // Brand: arbitrary UUID reject (non-staff explicit id for profile they do not own)
  assert.deepEqual(
    decideBrandAssignment({
      authority: owner,
      profile: { id: "brand-1", owner_id: "other-owner", tenant_id: null },
      targetTenantId: tenantA,
      explicitProfileId: true,
      tenantAlreadyHasOtherBrand: false,
    }),
    { allow: false, reason: "arbitrary_uuid_claim_rejected" }
  );

  // Brand: operator reject
  assert.deepEqual(
    decideBrandAssignment({
      authority: operator,
      profile: { id: "brand-1", owner_id: "op-1", tenant_id: null },
      targetTenantId: tenantA,
      explicitProfileId: false,
      tenantAlreadyHasOtherBrand: false,
    }),
    { allow: false, reason: "not_authorized" }
  );

  // Brand: viewer reject
  assert.deepEqual(
    decideBrandAssignment({
      authority: viewer,
      profile: { id: "brand-1", owner_id: "view-1", tenant_id: null },
      targetTenantId: tenantA,
      explicitProfileId: false,
      tenantAlreadyHasOtherBrand: false,
    }),
    { allow: false, reason: "not_authorized" }
  );

  // Account: staff success
  assert.deepEqual(
    decideAccountAssignment({
      authority: staff,
      account: { id: "acct-1", owner_id: "other", tenant_id: null, platform: "instagram", status: "CONNECTED" },
      targetTenantId: tenantA,
      explicitAccountId: true,
    }),
    { allow: true, idempotent: false }
  );

  // Account: owner + integration:configure success (owner role has integration:configure)
  assert.deepEqual(
    decideAccountAssignment({
      authority: owner,
      account: { id: "acct-1", owner_id: "owner-1", tenant_id: null, platform: "instagram", status: "CONNECTED" },
      targetTenantId: tenantA,
      explicitAccountId: false,
    }),
    { allow: true, idempotent: false }
  );

  // Account: idempotent same tenant
  assert.deepEqual(
    decideAccountAssignment({
      authority: owner,
      account: { id: "acct-1", owner_id: "owner-1", tenant_id: tenantA, platform: "instagram", status: "CONNECTED" },
      targetTenantId: tenantA,
      explicitAccountId: false,
    }),
    { allow: true, idempotent: true }
  );

  // Account: cross-tenant reject
  assert.deepEqual(
    decideAccountAssignment({
      authority: staff,
      account: { id: "acct-1", owner_id: "owner-1", tenant_id: tenantB, platform: "instagram", status: "CONNECTED" },
      targetTenantId: tenantA,
      explicitAccountId: true,
    }),
    { allow: false, reason: "cross_tenant_reassignment" }
  );

  // Account: random member claim reject (explicit UUID, not owner, no integration permission)
  assert.deepEqual(
    decideAccountAssignment({
      authority: viewerClaimant,
      account: { id: "acct-1", owner_id: "real-owner", tenant_id: null, platform: "instagram", status: "CONNECTED" },
      targetTenantId: tenantA,
      explicitAccountId: true,
    }),
    { allow: false, reason: "arbitrary_uuid_claim_rejected" }
  );

  console.log("package-tenant-assignment.test.ts: ALL PASS");
}

run();
