// Run with: node --experimental-strip-types lib/rbac/__tests__/admin-operations-recovery.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  const page = read("app", "admin", "(shell)", "operations", "page.tsx");
  for (const endpoint of ["/api/platform/queue", "/api/platform/missions", "/api/platform/handoffs", "/api/platform/approvals"]) {
    assert.ok(page.includes(endpoint), `operations must aggregate ${endpoint}`);
  }
  for (const label of ["Impact:", "age", "Evidence", "Open Audit Delivery"]) {
    assert.ok(page.includes(label), `operations exceptions must show ${label}`);
  }
  assert.ok(/\["FAILED", "BLOCKED", "HUMAN_HANDOFF"\]/.test(page), "failed and blocked work must surface as exceptions");
  assert.ok(/window\.prompt\("Why is this job safe to retry\?"\)/.test(page), "dead-letter retry must capture an operator reason");
  assert.ok(/\/api\/platform\/admin\/queue\/dead-letter/.test(page), "dead-letter retry must use the guarded staff route");

  const recoveryRoute = read("app", "api", "platform", "admin", "queue", "dead-letter", "route.ts");
  const tenantGate = recoveryRoute.indexOf("requireTenantContext(tenantId)");
  const staffGate = recoveryRoute.indexOf("requirePlatformStaff(ctx.userId");
  const mutation = recoveryRoute.indexOf("requeueDeadLetter({ jobId, tenantId })");
  assert.ok(tenantGate >= 0 && staffGate > tenantGate && mutation > staffGate, "retry must verify tenant membership and platform staff before mutation");
  assert.ok(/!reason\?\.trim\(\)/.test(recoveryRoute), "retry must reject a missing reason");
  assert.ok(/recordAuditEvent/.test(recoveryRoute) && /queue\.dead_letter_requeued/.test(recoveryRoute), "retry must create an audit event");

  console.log("admin-operations-recovery.test.ts: ALL PASS (exception aggregation, evidence, guarded reason-captured recovery, audit event)");
}

run();
