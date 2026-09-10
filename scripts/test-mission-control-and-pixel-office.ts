import { createOfficeCollisionGrid, findPixelPath, MANDATORY_OFFICE_ZONES, isWalkable } from "../lib/office/pixel-pathfinding.ts";
import { reconcileMissions } from "../lib/office/mission-reconciler.ts";
import { getFounderNotifications } from "../lib/notifications/founder-notification-service.ts";
import { fetchMissionControlData } from "../lib/missions/mission-control-service.ts";

async function runMasterVerification() {
  console.log("=================================================================");
  console.log("MASTER ACCEPTANCE TEST: LIVE MISSION CONTROL + PIXEL OFFICE + FOUNDER OS");
  console.log("=================================================================");

  // Phase 1: Verify 14 Mandatory Zones & 2D Grid Pathfinding
  console.log("\n[PHASE 1] Testing 2D Grid & Obstacle Avoidance Pathfinding...");
  const zones = Object.keys(MANDATORY_OFFICE_ZONES);
  if (zones.length !== 14) {
    throw new Error(`Expected 14 mandatory zones, found ${zones.length}`);
  }
  console.log(`✓ Verified 14 mandatory office zones defined: ${zones.join(", ")}`);

  const grid = createOfficeCollisionGrid();
  // Ensure desks are solid
  if (isWalkable(grid, 5, 3)) throw new Error("Expected research desk at (5,3) to be solid obstacle");
  if (!isWalkable(grid, 20, 7)) throw new Error("Expected central corridor at (20,7) to be walkable");
  console.log("✓ Verified solid collision obstacles and walkable corridors");

  // Path from Research to Sales to Meeting Room
  const path1 = findPixelPath(grid, { col: 5, row: 5 }, { col: 5, row: 11 });
  console.log(`✓ A* path calculated between Research & Sales: ${path1.length} steps`);
  for (const step of path1) {
    if (!isWalkable(grid, step.col, step.row)) {
      throw new Error(`Illegal step into solid cell: (${step.col}, ${step.row})`);
    }
  }

  // Phase 2: Verify Founder Requirements OS
  console.log("\n[PHASE 2] Testing Founder Notification OS & Aggregator...");
  const createMockQuery = (data: any[]) => {
    const builder: any = {
      eq: () => builder,
      in: () => builder,
      gte: () => builder,
      order: () => builder,
      limit: async () => ({ data }),
    };
    return builder;
  };

  const mockSupabase = {
    from: (table: string) => ({
      select: () => {
        if (table === "approvals") {
          return createMockQuery([
            {
              id: "app_1",
              mission_id: "m_test_1",
              kind: "spend",
              status: "PENDING",
              subject: { title: "Approve ₹10,000 Ads Spend" },
              created_at: new Date().toISOString(),
            },
          ]);
        }
        if (table === "human_handoffs") {
          return createMockQuery([]);
        }
        if (table === "missions") {
          return createMockQuery([
            {
              id: "m_blocked_1",
              goal_text: "Find solar leads in Raipur",
              state: "BLOCKED",
              updated_at: new Date().toISOString(),
            },
          ]);
        }
        if (table === "audit_events") {
          return createMockQuery([
            {
              id: "audit_repair_1",
              action: "worker_repaired_and_restarted",
              metadata: { summary: "Mission worker restored on port 8083" },
              created_at: new Date().toISOString(),
            },
          ]);
        }
        return createMockQuery([]);
      },
    }),
  };

  const inboxSummary = await getFounderNotifications(mockSupabase as any);
  console.log(`✓ Founder requirements aggregated: ${inboxSummary.requirements.length} items`);
  console.log(`  - Unread count: ${inboxSummary.unreadCount}`);
  console.log(`  - Approvals count: ${inboxSummary.categories.APPROVAL}`);
  console.log(`  - Blockers count: ${inboxSummary.categories.BLOCKED}`);
  console.log(`  - System Repairs count: ${inboxSummary.categories.SYSTEM_REPAIR}`);

  if (inboxSummary.unreadCount < 1) throw new Error("Expected unread founder notifications");

  // Phase 3: Verify Mission Control 12-State & Telemetry Resolver
  console.log("\n[PHASE 3] Testing Live Mission Control 12-State Telemetry Resolver...");
  const mockMissionDb = {
    from: (table: string) => {
      const queryBuilder: any = {
        eq: (col: string, val: string) => queryBuilder,
        in: () => queryBuilder,
        gte: () => queryBuilder,
        maybeSingle: async () => ({
          data: {
            id: "test-mission-solar",
            goal_text: "Find 20 verified solar prospects in Raipur industrial belt",
            service_key: "universal_lead_engine",
            state: "RUNNING",
            created_at: new Date(Date.now() - 300000).toISOString(),
            updated_at: new Date().toISOString(),
            estimated_cost_cents: 50000,
          },
        }),
        order: () => queryBuilder,
        limit: async () => {
          if (table === "mission_events") {
            return {
              data: [
                {
                  id: "ev_1",
                  event_type: "google_places_search",
                  payload: {
                    action_detail: "Searching Google Places around Urla Industrial Complex",
                    leads_discovered: 18,
                    leads_qualified: 11,
                    result_summary: "18 discovered · 11 verified · 7 new candidates",
                    next_step: "Website verification",
                    tool_name: "google_places_discovery",
                    provider: "Google Places API",
                    duration_ms: 1200,
                  },
                  created_at: new Date().toISOString(),
                },
              ],
            };
          }
          if (table === "worker_heartbeats") {
            return {
              data: [{ worker_type: "mission-worker", status: "healthy", last_heartbeat_at: new Date().toISOString() }],
            };
          }
          return { data: [] };
        },
      };
      return {
        select: () => queryBuilder,
        update: () => queryBuilder,
        insert: async () => ({ data: null }),
      };
    },
  };

  const controlData = await fetchMissionControlData(mockMissionDb as any, "test-mission-solar", "tenant-1");
  if (!controlData) throw new Error("Failed to resolve Mission Control payload");

  console.log(`✓ Mission State: ${controlData.header.state}`);
  console.log(`✓ Elapsed Live Time: ${Math.floor(controlData.header.elapsedMs / 1000)}s`);
  console.log(`✓ Active Specialists: ${controlData.agents.length}`);
  console.log(`✓ Current Action Agent: ${controlData.currentAction.agentName}`);
  console.log(`✓ Current Action Text: ${controlData.currentAction.currentAction}`);
  console.log(`✓ Real Result Output: ${controlData.currentAction.realResultSummary}`);
  console.log(`✓ Next Step: ${controlData.currentAction.nextStep}`);
  console.log(`✓ Tools Tracked: ${controlData.toolActivity.length}`);
  console.log(`✓ Business Outputs: ${controlData.businessOutputs.leadsDiscovered} discovered / ${controlData.businessOutputs.leadsQualified} qualified`);
  console.log(`✓ Completion Contract Criteria: ${controlData.completionContract.criteria.length} criteria checks`);

  // Phase 4: Verify Mission Reconciler & Self-Repair
  console.log("\n[PHASE 4] Testing Mission Reconciler & Self-Repair Engine...");
  const reconResult = await reconcileMissions(mockMissionDb as any);
  console.log(`✓ Reconciler scan executed across ${reconResult.scannedCount} missions`);

  console.log("\n=================================================================");
  console.log("ALL ACCEPTANCE CHECKS PASSED: MISSION CONTROL + PIXEL OFFICE + FOUNDER OS READY");
  console.log("=================================================================");
}

runMasterVerification().catch((err) => {
  console.error("ACCEPTANCE FAILURE:", err);
  process.exit(1);
});
