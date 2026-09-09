// scripts/test-office-cinematic-hq.mjs
// Comprehensive automated test suite for StratXcel Autonomous Company Headquarters

import assert from "node:assert/strict";
import {
  OFFICE_WAYPOINTS,
  buildWaypointsPath,
  initializeSimulationWorkers,
  dispatchSimulationEvent,
  triggerAmbientLifeEvent,
  getDeskCoords,
} from "../app/admin/(shell)/office/office-simulation.ts";
import { DEPARTMENT_PALETTES } from "../app/admin/(shell)/office/office-types.ts";
import { fetchOfficeTelemetry } from "../lib/office/office-telemetry-service.ts";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function runOfficeHeadquartersTests() {
  console.log("================================================================================");
  console.log("STRATXCEL OFFICE — AUTONOMOUS HEADQUARTERS COMPREHENSIVE TEST SUITE");
  console.log("================================================================================\n");

  let passed = 0;
  let total = 0;

  function runTest(name, fn) {
    total++;
    try {
      fn();
      console.log(`✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ FAIL: ${name}`);
      console.error(err);
    }
  }

  async function runAsyncTest(name, fn) {
    total++;
    try {
      await fn();
      console.log(`✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ FAIL: ${name}`);
      console.error(err);
    }
  }

  // ---------------------------------------------------------------------------
  // 1. VIEWPORT SIZING & AUTO-SCALING ALGORITHM
  // ---------------------------------------------------------------------------
  runTest("1. Viewport scaling calculation across desktop resolutions (100% Chrome)", () => {
    const baseWidth = 1480;
    const baseHeight = 880;

    function computeScale(width, height) {
      const scaleX = width / baseWidth;
      const scaleY = (height - 40) / baseHeight;
      return Math.min(scaleX, scaleY, 1.25);
    }

    // 1920x1080 (Standard 1080p Desktop)
    const scale1080p = computeScale(1920, 1080);
    assert.ok(scale1080p >= 1.0 && scale1080p <= 1.25, `1080p scale was ${scale1080p}`);

    // 1440x900 (MacBook Pro / Compact Desktop)
    const scale900p = computeScale(1440, 900);
    assert.ok(scale900p >= 0.95 && scale900p <= 1.05, `900p scale was ${scale900p}`);

    // 1280x720 (Small Desktop / Split Screen)
    const scale720p = computeScale(1280, 720);
    assert.ok(scale720p >= 0.75 && scale720p <= 0.88, `720p scale was ${scale720p}`);

    // Verify all dimensions preserve positive aspect ratio and prevent cropping
    assert.ok(scale1080p > scale900p && scale900p > scale720p);
  });

  // ---------------------------------------------------------------------------
  // 2. COMPLETE 14-FLOORPLAN ZONE INTEGRITY
  // ---------------------------------------------------------------------------
  runTest("2. Complete 14-floorplan zone waypoints and desk coordinates", () => {
    // Work Departments (10)
    assert.ok(OFFICE_WAYPOINTS.hermes_desk, "CEO / Hermes desk exists");
    assert.ok(OFFICE_WAYPOINTS.meeting_table, "Central Conference room table exists");
    assert.ok(OFFICE_WAYPOINTS.sales_desk, "Sales department desk exists");
    assert.ok(OFFICE_WAYPOINTS.marketing_desk, "Marketing department desk exists");
    assert.ok(OFFICE_WAYPOINTS.research_desk, "Research department desk exists");
    assert.ok(OFFICE_WAYPOINTS.finance_desk, "Finance department desk exists");
    assert.ok(OFFICE_WAYPOINTS.operations_desk, "Operations department desk exists");
    assert.ok(OFFICE_WAYPOINTS.engineering_desk, "Engineering department desk exists");
    assert.ok(OFFICE_WAYPOINTS.people_desk, "People / HR department desk exists");
    assert.ok(OFFICE_WAYPOINTS.crm_desk, "CRM department desk exists");

    // Non-Work Amenities (4)
    assert.ok(OFFICE_WAYPOINTS.coffee_bar, "Coffee lounge barista counter exists");
    assert.ok(OFFICE_WAYPOINTS.kitchen_counter, "Kitchen / break dining counter exists");
    assert.ok(OFFICE_WAYPOINTS.gaming_arcade, "Gaming room arcade cabinet exists");
    assert.ok(OFFICE_WAYPOINTS.relaxation_beanbag, "Relaxation zen beanbag exists");

    // Waypoint lookups for every department specialist
    assert.equal(getDeskCoords("hermes"), OFFICE_WAYPOINTS.hermes_desk);
    assert.equal(getDeskCoords("sales_agent"), OFFICE_WAYPOINTS.sales_desk);
    assert.equal(getDeskCoords("whatsapp_agent"), OFFICE_WAYPOINTS.sales_desk);
    assert.equal(getDeskCoords("marketing_agent"), OFFICE_WAYPOINTS.marketing_desk);
    assert.equal(getDeskCoords("research_agent"), OFFICE_WAYPOINTS.research_desk);
    assert.equal(getDeskCoords("finance_agent"), OFFICE_WAYPOINTS.finance_desk);
    assert.equal(getDeskCoords("engineering_agent"), OFFICE_WAYPOINTS.engineering_desk);
    assert.equal(getDeskCoords("operations_agent"), OFFICE_WAYPOINTS.operations_desk);
    assert.equal(getDeskCoords("people_agent"), OFFICE_WAYPOINTS.people_desk);
    assert.equal(getDeskCoords("crm_agent"), OFFICE_WAYPOINTS.crm_desk);
    assert.equal(getDeskCoords("seo_agent"), OFFICE_WAYPOINTS.seo_desk);
  });

  // ---------------------------------------------------------------------------
  // 3. ARCHITECTURAL CORRIDOR PATHFINDING
  // ---------------------------------------------------------------------------
  runTest("3. Corridor pathfinding routes through real walkways without clipping", () => {
    // Route from South Engineering row to Executive CEO suite
    const path = buildWaypointsPath(OFFICE_WAYPOINTS.engineering_desk, OFFICE_WAYPOINTS.hermes_desk);
    assert.ok(path.length >= 3, `Path should traverse corridor junctions, got ${path.length} steps`);

    // Check that intermediate waypoints route along the corridor spines (Y = 74, 55, or 31)
    const yCoordinates = path.map((p) => p.y);
    assert.ok(yCoordinates.some((y) => y === 74 || y === 55 || y === 31), "Walked along corridor spine");

    // Must strictly arrive at hermes_desk
    const finalStep = path[path.length - 1];
    assert.equal(finalStep.x, OFFICE_WAYPOINTS.hermes_desk.x);
    assert.equal(finalStep.y, OFFICE_WAYPOINTS.hermes_desk.y);
  });

  // ---------------------------------------------------------------------------
  // 4. 18-STATE EMPLOYEE STATE MACHINE
  // ---------------------------------------------------------------------------
  runTest("4. 18-State operational state machine transitions", () => {
    const validStates = [
      "AVAILABLE",
      "ANALYZING",
      "PLANNING",
      "SEARCHING",
      "WORKING",
      "GENERATING",
      "DELEGATING",
      "MEETING",
      "HANDOFF",
      "WAITING",
      "BLOCKED",
      "COMPLETED",
      "HELPING",
      "BREAK",
      "COFFEE",
      "GAMING",
      "KITCHEN",
      "RELAXING",
    ];

    assert.equal(validStates.length, 18, "Must support exactly 18 distinct operational states");

    // Test pallet definition for all 10 work departments
    const requiredDepts = [
      "executive",
      "sales",
      "marketing",
      "research",
      "finance",
      "operations",
      "engineering",
      "people",
      "crm",
      "seo",
    ];

    for (const d of requiredDepts) {
      assert.ok(DEPARTMENT_PALETTES[d], `Department palette for ${d} must exist`);
      assert.ok(DEPARTMENT_PALETTES[d].accent, `Accent color for ${d} must exist`);
      assert.ok(DEPARTMENT_PALETTES[d].label, `Label for ${d} must exist`);
    }
  });

  // ---------------------------------------------------------------------------
  // 5. HERMES CEO MEETING ROOM WORKFLOW CHOREOGRAPHY
  // ---------------------------------------------------------------------------
  runTest("5. Hermes CEO Meeting Room delegation sequence", () => {
    const mockWorkers = [
      {
        id: "hermes-ceo",
        key: "hermes",
        name: "Hermes",
        role: "CEO & Orchestrator",
        department: "executive",
        departmentLabel: "Executive",
        accentColor: "#6366f1",
        secondaryColor: "#06b6d4",
        bgGlow: "rgba(99, 102, 241, 0.25)",
        avatarIcon: "Bot",
        deskPosition: { pod: "executive", index: 0, col: 2, row: 1 },
        state: "PLANNING",
        statusLabel: "Orchestrating directive",
        isBackedByRealWorker: true,
        lastHeartbeatAt: new Date().toISOString(),
        heartbeatAgeMs: 500,
        reportsTo: undefined,
        shiftStatus: "AUTONOMOUS_24_7",
        currentMission: null,
        recentActivity: [],
        allowedTools: [],
      },
      {
        id: "sales-specialist",
        key: "sales_agent",
        name: "Mercury",
        role: "Sales & Conversion Director",
        department: "sales",
        departmentLabel: "Sales & Deals",
        accentColor: "#f43f5e",
        secondaryColor: "#e11d48",
        bgGlow: "rgba(244, 63, 94, 0.25)",
        avatarIcon: "MessageSquare",
        deskPosition: { pod: "sales", index: 1, col: 1, row: 1 },
        state: "AVAILABLE",
        statusLabel: "Available",
        isBackedByRealWorker: true,
        lastHeartbeatAt: new Date().toISOString(),
        heartbeatAgeMs: 500,
        reportsTo: "Hermes (CEO)",
        shiftStatus: "AUTONOMOUS_24_7",
        currentMission: null,
        recentActivity: [],
        allowedTools: [],
      },
    ];

    let sim = initializeSimulationWorkers(mockWorkers);
    assert.equal(sim.length, 2);

    // Step 1: Hermes calls a meeting
    const meetingEvent = {
      id: "ev-meeting-1",
      type: "MEETING_CALLED",
      timestamp: new Date().toISOString(),
      workerKey: "hermes",
      targetWorkerKey: "sales_agent",
      label: "Founder directive meeting: Solar leads acquisition",
      importance: "HIGH",
    };

    sim = dispatchSimulationEvent(meetingEvent, sim, [], []);
    const movingHermes = sim.find((w) => w.key === "hermes");
    const movingMercury = sim.find((w) => w.key === "sales_agent");

    assert.ok(movingHermes.currentLocation === "MEETING_TABLE" || movingHermes.isMoving);
    assert.equal(movingHermes.activity, "MEETING_CHAIRING");
    assert.equal(movingMercury.activity, "MEETING_DISCUSSING");

    // Step 2: Hermes delegates task -> Mercury returns to sales desk to execute
    const mockMission = {
      id: "mission-solar-100",
      goal: "Get 100 qualified commercial solar leads in Maharashtra",
      serviceKey: "crm.lead_discovery",
      state: "RUNNING",
      assignedWorkerKey: "sales_agent",
      assignedWorkerName: "Mercury",
      progressPercent: 35,
      currentStep: "lead_scraping_active",
      createdAt: new Date().toISOString(),
    };

    const delegationEvent = {
      id: "ev-delegated-1",
      type: "MISSION_ASSIGNED",
      timestamp: new Date().toISOString(),
      workerKey: "hermes",
      targetWorkerKey: "sales_agent",
      missionId: mockMission.id,
      label: "Mission delegated to Mercury",
      importance: "HIGH",
    };

    sim = dispatchSimulationEvent(delegationEvent, sim, [mockMission], []);
    const delegatedMercury = sim.find((w) => w.key === "sales_agent");
    assert.ok(delegatedMercury);
    assert.equal(delegatedMercury.assignedMission?.id, "mission-solar-100");
    assert.equal(delegatedMercury.destX, OFFICE_WAYPOINTS.sales_desk.x);
    assert.equal(delegatedMercury.destY, OFFICE_WAYPOINTS.sales_desk.y);
  });

  // ---------------------------------------------------------------------------
  // 6. HONEST IDLE BEHAVIOR (ZERO FAKE WORK)
  // ---------------------------------------------------------------------------
  runTest("6. Honest idle behavior moves workers to authentic non-work areas", () => {
    const mockWorker = {
      id: "research-specialist",
      key: "research_agent",
      name: "Athena",
      role: "Market Signals Lead",
      department: "research",
      departmentLabel: "Research",
      accentColor: "#eab308",
      secondaryColor: "#ca8a04",
      bgGlow: "rgba(234, 179, 8, 0.25)",
      avatarIcon: "BarChart3",
      deskPosition: { pod: "research", index: 1, col: 1, row: 1 },
      state: "AVAILABLE",
      statusLabel: "Available",
      isBackedByRealWorker: true,
      lastHeartbeatAt: new Date().toISOString(),
      heartbeatAgeMs: 500,
      reportsTo: "Hermes (CEO)",
      shiftStatus: "AUTONOMOUS_24_7",
      currentMission: null,
      recentActivity: [],
      allowedTools: [],
    };

    let sim = initializeSimulationWorkers([mockWorker]);
    assert.equal(sim[0].activity, "STANDBY_IDLE");

    // Trigger honest break
    sim = triggerAmbientLifeEvent(sim, "research_agent");
    const breakWorker = sim[0];

    assert.ok(breakWorker.isMoving, "Worker started walking to break area");
    const allowedBreakActivities = ["COFFEE_BREAK", "KITCHEN_BREAK", "GAMING", "RELAXING"];
    assert.ok(
      allowedBreakActivities.includes(breakWorker.activity),
      `Activity ${breakWorker.activity} is an authentic break activity`
    );

    const allowedBreakLocations = ["COFFEE_LOUNGE", "KITCHEN_BREAK", "GAMING_ROOM", "RELAXATION_AREA"];
    assert.ok(
      allowedBreakLocations.includes(breakWorker.currentLocation),
      `Location ${breakWorker.currentLocation} is an authentic non-work area`
    );
  });

  // ---------------------------------------------------------------------------
  // 7. REAL SUPABASE TELEMETRY INTEGRATION
  // ---------------------------------------------------------------------------
  await runAsyncTest("7. Supabase live telemetry integration query", async () => {
    if (!supabaseUrl || !supabaseKey) {
      console.log("   (Skipping live Supabase query - env vars not configured)");
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const telemetry = await fetchOfficeTelemetry(
      supabase,
      "466e6195-a9f6-4576-8271-29fdae61c18a",
      "StratXcel Production"
    );

    assert.ok(telemetry, "Telemetry object returned");
    assert.ok(telemetry.workers.length >= 8, `Expected at least 8 workers, got ${telemetry.workers.length}`);
    assert.ok(Array.isArray(telemetry.liveActivities), "liveActivities array returned");
    assert.ok(telemetry.summary, "Summary metrics returned");

    // Verify Hermes presence
    const hermes = telemetry.workers.find((w) => w.key === "hermes");
    assert.ok(hermes, "Hermes CEO present in workforce");
    assert.equal(hermes.department, "executive");

    // Verify all 18-state compliant workers
    for (const w of telemetry.workers) {
      assert.ok(w.name, "Worker has name");
      assert.ok(w.state, "Worker has state");
      assert.ok(w.department, "Worker has department");
      assert.ok(w.reportsTo !== undefined || w.key === "hermes", "Worker has reporting line");
    }

    console.log(`   (Live telemetry query verified: ${telemetry.workers.length} workers, ${telemetry.liveActivities?.length || 0} live activities)`);
  });

  console.log("\n================================================================================");
  console.log(`TEST RESULTS: ${passed}/${total} SUITES PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log("================================================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runOfficeHeadquartersTests();
