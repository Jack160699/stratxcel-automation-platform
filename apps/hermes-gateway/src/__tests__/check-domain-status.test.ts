// Run with: node --experimental-strip-types apps/hermes-gateway/src/__tests__/check-domain-status.test.ts
//
// Verifies check_domain_status -- Hermes' sixth tool, exposing real live
// domain DNS/Vercel status. Note: this file's own source has CRLF line
// endings (this repo's Windows git config) -- the source string is always
// normalized to LF before any multi-line regex match, or a pattern with
// two adjacent literal \n's silently fails to match.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

async function testSchemaRequiresDomainAndForbidsSmuggledFields() {
  const { TOOL_INPUT_SCHEMAS } = await import("@stratxcel/hermes");
  const schema = TOOL_INPUT_SCHEMAS.check_domain_status;
  assert.equal(schema.safeParse({}).success, false, "domain is required");
  assert.equal(schema.safeParse({ domain: "" }).success, false, "an empty domain is not valid");
  assert.equal(schema.safeParse({ domain: "www.example.com" }).success, true);
  assert.equal(schema.safeParse({ domain: "www.example.com", tenantId: "attacker-supplied" }).success, false, "must reject any model-supplied tenantId");
  console.log("check-domain-status.test.ts: the real schema requires domain and forbids a smuggled tenantId — PASS");
}

async function testHandlerCallsBothRealFunctionsAndDegradesGracefully() {
  const source = fs.readFileSync(path.join(process.cwd(), "apps", "hermes-gateway", "src", "tool-handlers.ts"), "utf8").replace(/\r\n/g, "\n");
  const block = source.match(/async check_domain_status\(_ctx, input\) \{[\s\S]*?\n  \},\n\};/)?.[0];
  assert.ok(block, "check_domain_status handler must exist in tool-handlers.ts");
  assert.match(block!, /inspectDomainDns\(/, "must call the real DNS inspection function");
  assert.match(block!, /getVercelDomainStatus\(/, "must call the real Vercel domain status function");
  assert.match(block!, /Promise\.all/, "must run both real lookups concurrently, not serially");
  assert.match(block!, /\.catch\(/, "a failure in either real lookup must degrade gracefully, not crash the whole call");
  console.log("check-domain-status.test.ts: the real handler calls both real functions concurrently and degrades gracefully on failure — PASS");
}

async function run() {
  await testSchemaRequiresDomainAndForbidsSmuggledFields();
  await testHandlerCallsBothRealFunctionsAndDegradesGracefully();
  console.log("check-domain-status.test.ts (@stratxcel/hermes-gateway): ALL PASS");
}

run();
