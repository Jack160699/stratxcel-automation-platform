// Run with: node --experimental-strip-types lib/office/__tests__/office-telemetry.test.ts
import assert from "node:assert/strict";
import { fetchOfficeTelemetry } from "../office-telemetry-service.ts";
import { DEPARTMENT_PALETTES } from "../../../app/admin/(shell)/office/office-types.ts";

function createMockDb({
  heartbeats = [],
  missions = [],
  events = [],
  agentDefs = [],
}: {
  heartbeats?: any[];
  missions?: any[];
  events?: any[];
  agentDefs?: any[];
}) {
  return {
    from(table: string) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        gte() {
          return this;
        },
        order() {
          return this;
        },
        limit() {
          let data: any[] = [];
          if (table === "worker_heartbeats") data = heartbeats;
          if (table === "missions") data = missions;
          if (table === "mission_events") data = events;
          if (table === "agent_definitions") data = agentDefs;
          return Promise.resolve({ data, error: null });
        },
      };
    },
  };
}

async function testOfficeTelemetry() {
  console.log("Running office-telemetry.test.ts...");

  // 1. Check department palettes exist and are properly styled
  assert.ok(DEPARTMENT_PALETTES.executive.accent);
  assert.ok(DEPARTMENT_PALETTES.seo.accent === "#10b981");
  assert.ok(DEPARTMENT_PALETTES.content.accent === "#f59e0b");
  assert.ok(DEPARTMENT_PALETTES.website.accent === "#3b82f6");
  assert.ok(DEPARTMENT_PALETTES.creative.accent === "#8b5cf6");
  assert.ok(DEPARTMENT_PALETTES.research.accent === "#eab308");
  assert.ok(DEPARTMENT_PALETTES.sales.accent === "#f43f5e");
  assert.ok(DEPARTMENT_PALETTES.operations.accent === "#06b6d4");

  // 2. Test active mission mapping to WORKING state
  const now = new Date().toISOString();
  const mockDbWithRunningMission = createMockDb({
    heartbeats: [
      {
        worker_type: "mission-worker",
        status: "idle",
        last_heartbeat_at: now,
      },
      {
        worker_type: "hermes-gateway",
        status: "idle",
        last_heartbeat_at: now,
      },
    ],
    missions: [
      {
        id: "mission-seo-1",
        state: "RUNNING",
        goal_text: "Analyze Solara Energy keyword rankings",
        service_key: "seo.audit",
        hermes_run_id: "run-123",
        created_at: now,
        updated_at: now,
      },
    ],
    events: [
      {
        mission_id: "mission-seo-1",
        event_type: "scraping_serp",
        created_at: now,
      },
    ],
  });

  const telemetry = await fetchOfficeTelemetry(mockDbWithRunningMission, "tenant-a", "Solara Energy");
  assert.equal(telemetry.tenantId, "tenant-a");
  assert.equal(telemetry.tenantName, "Solara Energy");

  const seoWorker = telemetry.workers.find((w) => w.key === "seo_agent");
  assert.ok(seoWorker, "SEO specialist must exist");
  assert.equal(seoWorker.state, "WORKING", "Active SEO mission must set state to WORKING");
  assert.equal(seoWorker.currentMission?.goal, "Analyze Solara Energy keyword rankings");
  assert.equal(seoWorker.currentMission?.currentStep, "scraping_serp");

  // Hermes CEO must reflect orchestration state
  const hermes = telemetry.workers.find((w) => w.key === "hermes");
  assert.ok(hermes);
  assert.equal(hermes.state, "WORKING", "Hermes must be WORKING when missions are running");

  // Data track / workflow edge must connect Hermes to SEO worker
  assert.equal(telemetry.workflows.length, 1);
  assert.equal(telemetry.workflows[0].fromWorkerId, "hermes-ceo");
  assert.equal(telemetry.workflows[0].toWorkerId, "seo-specialist");
  assert.equal(telemetry.workflows[0].active, true);

  // 3. Test empty office / all agents idle (Zero fake data)
  const mockDbIdle = createMockDb({
    heartbeats: [
      {
        worker_type: "mission-worker",
        status: "idle",
        last_heartbeat_at: now,
      },
      {
        worker_type: "hermes-gateway",
        status: "idle",
        last_heartbeat_at: now,
      },
    ],
    missions: [],
    events: [],
  });

  const idleTelemetry = await fetchOfficeTelemetry(mockDbIdle, "tenant-b", "Acme Corp");
  assert.equal(idleTelemetry.summary.allAgentsIdle, true);
  assert.equal(idleTelemetry.summary.workingCount, 0);
  assert.equal(idleTelemetry.workflows.length, 0, "No workflows should animate when idle");

  const idleSeo = idleTelemetry.workers.find((w) => w.key === "seo_agent");
  assert.equal(idleSeo?.state, "WAITING", "Worker with healthy heartbeat and no tasks is WAITING");
  assert.equal(idleSeo?.currentMission, null, "No fake mission should ever be attached");

  console.log("office-telemetry.test.ts: ALL PASS");
}

testOfficeTelemetry().catch((err) => {
  console.error(err);
  process.exit(1);
});
