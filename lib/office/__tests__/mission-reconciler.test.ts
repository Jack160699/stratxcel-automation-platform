import assert from "node:assert/strict";
import { reconcileMissions } from "../mission-reconciler.ts";

async function runTests() {
  // Test 1: Detects resolved blockers and self-repairs mission back to RUNNING
  {
    const mockMissions = [
      {
        id: "mission-blocked-123",
        goal_text: "Find solar prospects",
        state: "BLOCKED",
        updated_at: new Date(Date.now() - 60000).toISOString(),
      },
    ];

    const mockUpdates: any[] = [];
    const mockEvents: any[] = [];

    const mockSupabase = {
      from: (table: string) => ({
        select: () => ({
          in: () => ({
            order: () => ({
              limit: async () => ({ data: mockMissions }),
            }),
          }),
          order: () => ({
            limit: async () => ({
              data: [{ worker_type: "mission-worker", status: "healthy", last_heartbeat_at: new Date().toISOString() }],
            }),
          }),
          eq: async () => ({ data: [] }),
        }),
        update: (vals: any) => ({
          eq: async (col: string, id: string) => {
            mockUpdates.push({ col, id, vals });
            return { data: null };
          },
        }),
        insert: async (vals: any) => {
          mockEvents.push(vals);
          return { data: null };
        },
      }),
    };

    const result = await reconcileMissions(mockSupabase);

    assert.equal(result.anomaliesDetected.length, 1, "Should detect 1 anomaly");
    assert.equal(result.anomaliesDetected[0].type, "BLOCKED_RESOLVED");
    assert.equal(result.repairsApplied.length, 1, "Should apply 1 repair");
    assert.equal(result.repairsApplied[0].reconciledState, "RUNNING");
    assert.equal(mockUpdates.length, 1);
    assert.equal(mockUpdates[0].vals.state, "RUNNING");
    console.log("✓ Test 1 Passed: Blocker resolution self-repaired mission to RUNNING");
  }

  // Test 2: Detects stale RUNNING mission with no heartbeat and triggers repair event
  {
    const mockMissions = [
      {
        id: "mission-stale-999",
        goal_text: "Deploy customer website",
        state: "RUNNING",
        updated_at: new Date(Date.now() - 400000).toISOString(),
      },
    ];

    const mockEvents: any[] = [];

    const mockSupabase = {
      from: (table: string) => ({
        select: () => ({
          in: () => ({
            order: () => ({
              limit: async () => ({ data: mockMissions }),
            }),
          }),
          order: () => ({
            limit: async () => ({
              data: [{ worker_type: "mission-worker", status: "stopped", last_heartbeat_at: new Date(Date.now() - 400000).toISOString() }],
            }),
          }),
          eq: async () => ({ data: [] }),
        }),
        update: () => ({ eq: async () => ({}) }),
        insert: async (vals: any) => {
          mockEvents.push(vals);
          return { data: null };
        },
      }),
    };

    const result = await reconcileMissions(mockSupabase);

    assert.equal(result.anomaliesDetected.length, 1, "Should detect 1 anomaly");
    assert.equal(result.anomaliesDetected[0].type, "RUNNING_NO_HEARTBEAT");
    assert.equal(result.repairsApplied.length, 1);
    assert.ok(mockEvents.some((e) => e.event_type === "self_repair_reconciliation"), "Must log repair event");
    console.log("✓ Test 2 Passed: Stale RUNNING mission triggered repair reconciliation");
  }
}

runTests().then(() => {
  console.log("All mission-reconciler tests passed!");
});
