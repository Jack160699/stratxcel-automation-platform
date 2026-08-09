import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { heartbeatState, safeSummary } from "../mission-control.ts";

const root = process.cwd();
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");
const route = read("app", "api", "platform", "admin", "hermes", "telemetry", "route.ts");
const page = read("app", "admin", "(shell)", "hermes", "HermesMissionControl.tsx");
const serverPage = read("app", "admin", "(shell)", "hermes", "page.tsx");
const telemetry = read("lib", "hermes", "mission-control.ts");
const nav = read("components", "shell", "navigation", "admin-nav-data.ts");
const system = read("app", "admin", "(shell)", "system", "page.tsx");

assert.match(route, /auth\.getUser\(\)/, "telemetry API must authenticate independently");
assert.match(route, /requirePlatformStaff/, "telemetry API must require platform staff");
assert.match(route, /status: 401/, "telemetry API must deny anonymous requests");
assert.match(serverPage, /requirePlatformStaff/, "page must independently require platform staff");
assert.match(nav, /Hermes Mission Control.*\/admin\/hermes/, "admin navigation must contain Hermes");
assert.match(page, /visibilityState\s*===\s*["']visible/, "polling must pause while hidden");
assert.match(page, /10000/, "active telemetry refresh must be approximately ten seconds");
assert.match(page, /Last updated/, "page must show freshness");
assert.match(page, /Unavailable|Not monitored/, "missing telemetry must be explicit");
assert.match(telemetry, /DEAD_LETTER/, "DLQ must be represented");
assert.match(telemetry, /denied\|forbidden\|permission\|capability/i, "denied MCP calls must be represented");
assert.match(telemetry, /killSwitches/, "kill switches must be represented");
assert.doesNotMatch(system, /No Hermes instance reachable|MockHermesAdapter available for demos/, "stale mock-only Hermes copy must be removed");
assert.match(system, /worker_heartbeats/, "System Health must derive Hermes state from the gateway heartbeat");
assert.match(system, /global_hermes/, "System Health must honor the global Hermes kill switch");
for (const forbidden of ["encrypted_secret_ref", "service_role", "authorization", "bearer", "api_key", "capabilities"]) {
  assert.doesNotMatch(route, new RegExp(forbidden, "i"), `route response must not expose ${forbidden}`);
}
assert.equal(safeSummary({ api_key: "secret", reason: "denied" }), "denied");
assert.equal(safeSummary({ bearer_token: "secret" }), "Operational event");
assert.equal(heartbeatState(null), "unavailable");
assert.equal(heartbeatState(new Date(Date.now() - 180_000).toISOString()), "offline");
assert.equal(heartbeatState(new Date().toISOString(), "degraded"), "degraded");
assert.equal(heartbeatState(new Date().toISOString(), "busy"), "healthy");
console.log("mission-control.test.ts: ALL PASS");
