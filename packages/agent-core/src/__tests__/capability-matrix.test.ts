// Run with: node --experimental-strip-types packages/agent-core/src/__tests__/capability-matrix.test.ts
import assert from "node:assert/strict";
import { ADMIN_CAPABILITY_MATRIX, CLIENT_CAPABILITY } from "../capability-matrix.ts";
import { ADMIN_READ_TOOLS } from "../tools/admin/read-tools.ts";
import { ADMIN_MUTATION_TOOLS } from "../tools/admin/mutation-tools.ts";
import { CLIENT_READ_TOOLS, CLIENT_MUTATION_TOOLS } from "../tools/client/tools.ts";

function run() {
  const adminToolNames = new Set([...ADMIN_READ_TOOLS, ...ADMIN_MUTATION_TOOLS].map((t) => t.schema.name));
  const clientToolNames = new Set([...CLIENT_READ_TOOLS, ...CLIENT_MUTATION_TOOLS].map((t) => t.schema.name));

  // These tools live in the Next.js app (lib/agent-core/social-delegation-tools.ts),
  // not in a packages/agent-core registry, because they must import
  // lib/social/repositories (app-side code — see that file's header comment
  // for why). Declared here explicitly, by name, so this test still catches
  // any OTHER undeclared tool name slipping into the matrix.
  const knownAppLayerDelegatedTools = new Set(["social_inspect_accounts", "social_inspect_jobs"]);
  for (const name of knownAppLayerDelegatedTools) adminToolNames.add(name);

  for (const entry of ADMIN_CAPABILITY_MATRIX) {
    for (const name of [...entry.readTools, ...entry.mutationTools]) {
      assert.ok(adminToolNames.has(name), `admin capability matrix references unknown tool "${name}" (area: ${entry.area})`);
    }
    if (entry.level === "UNAVAILABLE") {
      assert.equal(entry.readTools.length, 0, `${entry.area} is UNAVAILABLE but lists read tools`);
      assert.equal(entry.mutationTools.length, 0, `${entry.area} is UNAVAILABLE but lists mutation tools`);
    }
    if (entry.level === "FULL") {
      assert.fail(
        `${entry.area} is marked FULL — this phase intentionally never claims FULL merely because a route/table exists; downgrade to READ or add explicit justification.`
      );
    }
  }

  for (const entry of CLIENT_CAPABILITY) {
    for (const name of [...entry.readTools, ...entry.mutationTools]) {
      assert.ok(clientToolNames.has(name), `client capability references unknown tool "${name}" (area: ${entry.area})`);
    }
    if (entry.level === "UNAVAILABLE") {
      assert.equal(entry.readTools.length, 0, `${entry.area} is UNAVAILABLE but lists read tools`);
      assert.equal(entry.mutationTools.length, 0, `${entry.area} is UNAVAILABLE but lists mutation tools`);
    }
  }

  // Note: a tool name (e.g. "create_mission") MAY legitimately appear in both
  // registries with tenant-scoping differences — resolveAgentTools() dispatches
  // exclusively by principal.kind (see tools/registry.ts), so a single
  // principal's resolved tool list is always drawn from exactly one registry.
  // This is intentionally not treated as a collision here.

  console.log("capability-matrix.test.ts (@stratxcel/agent-core): ALL PASS");
}

run();
