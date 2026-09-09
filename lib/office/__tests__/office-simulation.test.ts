// Run with: node --experimental-strip-types lib/office/__tests__/office-simulation.test.ts
import assert from "node:assert/strict";
import {
  OFFICE_WAYPOINTS,
  buildWaypointsPath,
  initializeSimulationWorkers,
  dispatchSimulationEvent,
  triggerAmbientLifeEvent,
} from "../../../app/admin/(shell)/office/office-simulation.ts";
import type { LiveWorker, OfficeMission, PhysicalArtifact, OfficeEvent } from "../../../app/admin/(shell)/office/office-types.ts";

function runSimulationTests() {
  console.log("Running office-simulation.test.ts...");

  // 1. Waypoint sanity checks
  assert.ok(OFFICE_WAYPOINTS.hermes_desk);
  assert.ok(OFFICE_WAYPOINTS.aether_desk);
  assert.ok(OFFICE_WAYPOINTS.coffee_bar);
  assert.ok(OFFICE_WAYPOINTS.mission_board);
  assert.ok(OFFICE_WAYPOINTS.meeting_table);

  // 2. Test Pathfinding along Hallways
  // Path from Aether desk (south row) to Hermes desk (executive suite)
  const path = buildWaypointsPath(OFFICE_WAYPOINTS.aether_desk, OFFICE_WAYPOINTS.hermes_desk);
  assert.ok(path.length >= 2, "Path must have at least corridor waypoint and destination");
  // Must end at hermes_desk
  const lastStep = path[path.length - 1];
  assert.equal(lastStep.x, OFFICE_WAYPOINTS.hermes_desk.x);
  assert.equal(lastStep.y, OFFICE_WAYPOINTS.hermes_desk.y);

  // 3. Test Simulation State Initialization
  const mockWorkers: LiveWorker[] = [
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
      state: "WAITING",
      statusLabel: "Standing by",
      isBackedByRealWorker: true,
      lastHeartbeatAt: new Date().toISOString(),
      heartbeatAgeMs: 1000,
      currentMission: null,
      recentActivity: [],
      allowedTools: [],
    },
    {
      id: "seo-specialist",
      key: "seo_agent",
      name: "Aether",
      role: "SEO Specialist",
      department: "seo",
      departmentLabel: "SEO & Discovery",
      accentColor: "#10b981",
      secondaryColor: "#059669",
      bgGlow: "rgba(16, 185, 129, 0.25)",
      avatarIcon: "Search",
      deskPosition: { pod: "growth", index: 1, col: 1, row: 2 },
      state: "WAITING",
      statusLabel: "Standing by",
      isBackedByRealWorker: true,
      lastHeartbeatAt: new Date().toISOString(),
      heartbeatAgeMs: 1000,
      currentMission: null,
      recentActivity: [],
      allowedTools: [],
    },
  ];

  let simWorkers = initializeSimulationWorkers(mockWorkers);
  assert.equal(simWorkers.length, 2);
  const aether = simWorkers.find((w) => w.key === "seo_agent");
  assert.ok(aether);
  assert.equal(aether.posture, "SEATED");
  assert.equal(aether.activity, "STANDBY_IDLE");

  // 4. Test Dispatching Real Mission Event
  const mockMission: OfficeMission = {
    id: "mission-seo-101",
    goal: "Rank keywords for Solara Energy",
    serviceKey: "seo.audit",
    state: "RUNNING",
    assignedWorkerKey: "seo_agent",
    assignedWorkerName: "Aether",
    progressPercent: 72,
    currentStep: "scraping_serp",
    createdAt: new Date().toISOString(),
  };

  const dispatchEvent: OfficeEvent = {
    id: "ev-1",
    type: "MISSION_ASSIGNED",
    timestamp: new Date().toISOString(),
    workerKey: "hermes",
    targetWorkerKey: "seo_agent",
    missionId: mockMission.id,
    label: "Hermes assigned SEO mission",
    importance: "HIGH",
  };

  simWorkers = dispatchSimulationEvent(dispatchEvent, simWorkers, [mockMission], []);
  const updatedAether = simWorkers.find((w) => w.key === "seo_agent");
  assert.ok(updatedAether);
  assert.equal(updatedAether.assignedMission?.id, "mission-seo-101");
  assert.equal(updatedAether.activity, "TYPING");

  // 5. Test Artifact Handoff Event
  const mockArtifact: PhysicalArtifact = {
    id: "art-seo-report",
    missionId: "mission-seo-101",
    kind: "seo_report",
    label: "SEO AUDIT REPORT",
    fromWorkerKey: "seo_agent",
    toWorkerKey: "hermes",
    createdAt: new Date().toISOString(),
  };

  const handoffEvent: OfficeEvent = {
    id: "ev-2",
    type: "ARTIFACT_HANDOFF",
    timestamp: new Date().toISOString(),
    workerKey: "seo_agent",
    targetWorkerKey: "hermes",
    missionId: mockMission.id,
    artifactId: mockArtifact.id,
    label: "Aether handing off SEO report to Hermes",
    importance: "HIGH",
  };

  simWorkers = dispatchSimulationEvent(handoffEvent, simWorkers, [mockMission], [mockArtifact]);
  const carryingAether = simWorkers.find((w) => w.key === "seo_agent");
  assert.ok(carryingAether);
  assert.equal(carryingAether.posture, "CARRYING");
  assert.equal(carryingAether.isMoving, true);
  assert.equal(carryingAether.holdingArtifact?.label, "SEO AUDIT REPORT");

  // 6. Test Ambient Life Event
  const idleSim = triggerAmbientLifeEvent(simWorkers, "hermes");
  const movingHermes = idleSim.find((w) => w.key === "hermes");
  assert.ok(movingHermes);
  assert.equal(movingHermes.isMoving, true);
  assert.equal(movingHermes.posture, "WALKING");

  console.log("office-simulation.test.ts: ALL PASS");
}

runSimulationTests();
