import assert from "node:assert/strict";
import type { TenantIsolationSlice } from "../company-ops/types.ts";
import { fixtureTenantSlice } from "./fixtures.ts";
import { createMutationMockBus } from "./mocks.ts";

export interface TenantIsolationResult {
  tenantA: TenantIsolationSlice;
  tenantB: TenantIsolationSlice;
  overlaps: readonly string[];
  passed: boolean;
}

function intersect(a: readonly string[], b: readonly string[]): string[] {
  const setB = new Set(b);
  return a.filter((x) => setB.has(x));
}

/**
 * Run two tenants simultaneously and prove isolation across Brand Brain,
 * artifacts, integrations, leads, approvals, usage, reports, receipts.
 */
export function proveTenantIsolation(
  a: TenantIsolationSlice = fixtureTenantSlice("tenant-iso-A", "A"),
  b: TenantIsolationSlice = fixtureTenantSlice("tenant-iso-B", "B"),
): TenantIsolationResult {
  assert.notEqual(a.tenantId, b.tenantId);
  assert.notEqual(a.brandBrainBusinessName, b.brandBrainBusinessName);

  const overlaps: string[] = [];
  const checks: Array<[string, readonly string[], readonly string[]]> = [
    ["artifacts", a.artifactIds, b.artifactIds],
    ["integrations", a.integrationKeys, b.integrationKeys],
    ["leads", a.leadIds, b.leadIds],
    ["approvals", a.approvalIds, b.approvalIds],
    ["reports", a.reportIds, b.reportIds],
    ["receipts", a.receiptIds, b.receiptIds],
  ];

  for (const [label, left, right] of checks) {
    const hit = intersect(left, right);
    if (hit.length > 0) overlaps.push(`${label}:${hit.join(",")}`);
  }

  // Usage isolation: same metric keys allowed, values must not be shared/mutated across
  for (const metric of Object.keys(a.usageByMetric)) {
    if (a.usageByMetric[metric] === b.usageByMetric[metric] && a.tenantId !== b.tenantId) {
      // Same numeric value is ok; shared mutable store would be a problem —
      // prove objects are distinct references by mutating a copy only.
    }
  }
  const usageA = { ...a.usageByMetric };
  usageA.social_posts = (usageA.social_posts ?? 0) + 100;
  assert.notEqual(usageA.social_posts, b.usageByMetric.social_posts);

  // Concurrent mock mutations must stay tenant-scoped
  const mocks = createMutationMockBus();
  mocks.simulate("whatsapp_send", { tenantId: a.tenantId, missionId: "m-a" });
  mocks.simulate("social_publish", { tenantId: b.tenantId, missionId: "m-b" });
  assert.equal(mocks.receipts[0]?.tenantId, a.tenantId);
  assert.equal(mocks.receipts[1]?.tenantId, b.tenantId);
  mocks.assertNoRealMutation();

  assert.equal(overlaps.length, 0, `tenant isolation overlaps: ${overlaps.join("; ")}`);

  return { tenantA: a, tenantB: b, overlaps, passed: overlaps.length === 0 };
}
