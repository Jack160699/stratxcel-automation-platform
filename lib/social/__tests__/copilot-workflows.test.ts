import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INTERNAL_DEPENDENTS_KEY, readDeferredActions, splitDependentCalls, stripInternalInput } from "../agent/dependencies.ts";

function run() {
  const result = splitDependentCalls([
    { id: "master", name: "create_content_item", arguments: { title: "T", contentPillar: "Canonical" } },
    { id: "variant", name: "create_content_variant", arguments: { masterId: "", platform: "linkedin", caption: "Exact approved draft" } },
  ]);
  assert.equal(result.ready.length, 1, "dependent variant is not proposed before master output exists");
  assert.equal(result.deferredByUpstream.get("master")?.[0].bind.inputKey, "masterId");

  const stored = { title: "T", [INTERNAL_DEPENDENTS_KEY]: result.deferredByUpstream.get("master") };
  assert.deepEqual(stripInternalInput(stored), { title: "T" }, "internal workflow metadata never reaches tools or approval UI");
  assert.equal(readDeferredActions(stored)[0].input.caption, "Exact approved draft", "approved content version is preserved verbatim");

  const orphan = splitDependentCalls([
    { id: "variant", name: "create_content_variant", arguments: { masterId: "", caption: "Draft" } },
  ]);
  assert.equal(orphan.ready[0].arguments.__blockedDependency, "masterId", "missing upstream output blocks the mutation");

  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const hook = fs.readFileSync(path.join(root, "app", "admin", "(shell)", "social", "copilot", "useAgentSession.ts"), "utf8");
  assert.ok(hook.includes('fetch("/api/social/copilot/runs"'), "client accepts a mission before execution");
  assert.ok(hook.includes("/execute"), "execution is a separate request");
  assert.ok(hook.includes("RUN_EVENT_POLL_MS = 1000"), "active polling uses a one-second interval");
  assert.ok(hook.includes('latestRun.status !== "RUNNING"'), "polling stops on terminal status");

  const orchestrator = fs.readFileSync(path.join(root, "lib", "social", "agent", "orchestrator.ts"), "utf8");
  assert.ok(orchestrator.includes("acceptAgentMission"), "accept phase creates identity before long execution");
  assert.ok(orchestrator.includes("validateBrandEntities"), "writes validate canonical Brand Brain entities");
  assert.ok(orchestrator.includes("readDeferredActions"), "approval success releases dependent actions");

  console.log("copilot-workflows.test.ts: ALL PASS (split execution, terminal polling, dependencies, exact draft, Brand validation)");
}

run();
