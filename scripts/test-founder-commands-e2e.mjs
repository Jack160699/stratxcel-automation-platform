import { decomposeNaturalLanguageIntent } from "../packages/connectors/src/resources/intent-decomposer.ts";
import { executeDecomposedPlan } from "../packages/connectors/src/resources/core-mcp-router.ts";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_COMMANDS = [
  {
    name: "Command 1: Update our SEO and get leads.",
    cmd: "Update our SEO and get leads.",
    expectedTasks: 2,
    expectedCapabilities: ["seo.launch", "crm.lead_discovery"],
  },
  {
    name: "Command 2: Launch an SEO agent for this company.",
    cmd: "Launch an SEO agent for this company.",
    expectedTasks: 1,
    expectedCapabilities: ["seo.launch"],
  },
  {
    name: "Command 3: Create 3 social posts for next week.",
    cmd: "Create 3 social posts for next week.",
    expectedTasks: 1,
    expectedCapabilities: ["content.campaign"],
  },
  {
    name: "Command 4: Build a website for this business.",
    cmd: "Build a website for this business.",
    expectedTasks: 1,
    expectedCapabilities: ["website.create"],
  },
];

async function runE2eTests() {
  console.log("=== EXECUTING HERMES FOUNDER COMMANDS E2E TEST ===\n");
  let passed = 0;

  for (const tc of TEST_COMMANDS) {
    console.log(`\n--- RUNNING ${tc.name} ---`);
    console.log(`Input: "${tc.cmd}"`);

    // 1. Intent Decomposition
    const plan = decomposeNaturalLanguageIntent(tc.cmd, {
      tenantId: "466e6195-a9f6-4576-8271-29fdae61c18a",
      companyScope: "Solara Energy",
      channel: "admin",
    });

    console.log(`Inferred Intent: ${plan.inferredIntent}`);
    console.log(`Tasks Count: ${plan.tasks.length}`);
    if (plan.tasks.length !== tc.expectedTasks) {
      throw new Error(`Expected ${tc.expectedTasks} tasks, got ${plan.tasks.length}`);
    }

    const caps = plan.tasks.map((t) => t.capabilityKey);
    console.log(`Decomposed Capabilities: ${caps.join(", ")}`);
    for (const exp of tc.expectedCapabilities) {
      if (!caps.includes(exp)) {
        throw new Error(`Expected capability ${exp} in ${caps}`);
      }
    }

    // 2. Real Execution via Core MCP Router
    const res = await executeDecomposedPlan(plan.tasks, {
      tenantId: "466e6195-a9f6-4576-8271-29fdae61c18a",
      channel: "admin",
      actorKind: "founder",
      supabaseClient: supabase,
    });

    console.log(`Plan Status: ${res.planStatus}`);
    if (res.planStatus !== "ALL_COMPLETED") {
      throw new Error(`Expected ALL_COMPLETED, got ${res.planStatus}`);
    }

    const missionId = res.missionId || res.parentMissionId;
    console.log(`Mission ID: ${missionId}`);
    if (!missionId) {
      throw new Error("Missing missionId in execution result");
    }

    // 3. Verify Database Persistence in Supabase
    const { data: missionRow, error: mErr } = await supabase
      .from("missions")
      .select("id, goal_text, service_key, state")
      .eq("id", missionId)
      .maybeSingle();

    if (mErr || !missionRow) {
      throw new Error(`Failed to find mission ${missionId} in DB: ${mErr?.message}`);
    }
    console.log(`DB Mission Verified: state=${missionRow.state}, service=${missionRow.service_key}`);

    const { data: events, error: eErr } = await supabase
      .from("mission_events")
      .select("event_type, payload")
      .eq("mission_id", missionId);

    if (eErr || !events || events.length === 0) {
      throw new Error(`Failed to find events for mission ${missionId}: ${eErr?.message}`);
    }
    console.log(`DB Events Verified: ${events.length} events logged (${events.map((e) => e.event_type).join(", ")})`);

    console.log(`Result Message Sample:\n${res.overallMessage.slice(0, 160)}...`);
    console.log(`Action Buttons: ${JSON.stringify(res.interactiveButtons)}`);

    passed++;
  }

  console.log(`\n========================================`);
  console.log(`ALL ${passed}/${TEST_COMMANDS.length} FOUNDER COMMANDS EXECUTED & VERIFIED ON REAL SUPABASE!`);
  console.log(`========================================\n`);
}

runE2eTests().catch((err) => {
  console.error("FATAL E2E ERROR:", err);
  process.exit(1);
});
