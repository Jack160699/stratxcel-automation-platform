// Run with: node --experimental-strip-types apps/hermes-gateway/src/__tests__/attach-research-evidence-isolation.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "apps", "hermes-gateway", "src", "tool-handlers.ts"),
  "utf8",
);

const attachBlock = source.match(
  /async attach_research_evidence\(ctx, input\) \{[\s\S]*?\n  \},/,
)?.[0];

assert.ok(attachBlock, "attach_research_evidence handler must exist");
assert.match(attachBlock, /mission_artifacts/, "must load mission_artifacts");
assert.match(attachBlock, /artifact\.mission_id !== ctx\.missionId/, "must reject wrong-mission artifacts");
assert.match(attachBlock, /mission\.tenant_id !== ctx\.tenantId/, "must reject wrong-tenant missions");
assert.match(attachBlock, /artifact_scope_rejected/, "must fail closed on scope mismatch");
assert.match(attachBlock, /from\("missions"\)/, "must verify mission tenant ownership");
assert.equal(
  /executeWorkforceCapabilityServer/.test(attachBlock),
  false,
  "attach must remain event-only and must not re-run research.web",
);

console.log("attach-research-evidence-isolation.test.ts: PASS");
