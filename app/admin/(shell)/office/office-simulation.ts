import type {
  LiveWorker,
  OfficeMission,
  PhysicalArtifact,
  WorkerPosture,
  WorkerLocation,
  OfficeEvent,
} from "./office-types";

export interface SimulationWorkerState {
  key: string;
  name: string;
  department: string;
  x: number; // 0-100 percentage of container width
  y: number; // 0-100 percentage of container height
  destX: number;
  destY: number;
  waypoints: Array<{ x: number; y: number }>;
  posture: WorkerPosture;
  facing: "left" | "right";
  activity:
    | "TYPING"
    | "MONITOR_READING"
    | "COFFEE_BREAK"
    | "INSPECTING_BOARD"
    | "HANDOFF_GESTURE"
    | "STANDBY_IDLE";
  currentLocation: WorkerLocation;
  holdingArtifact: { label: string; kind: string } | null;
  assignedMission: OfficeMission | null;
  accentColor: string;
  secondaryColor: string;
  isMoving: boolean;
}

// Canonical Spatial Waypoints (in % coordinates)
export const OFFICE_WAYPOINTS = {
  // Executive Suite
  hermes_desk: { x: 50, y: 32 },
  hermes_terrace: { x: 50, y: 24 },

  // Architecture & Board
  mission_board: { x: 74, y: 15 },
  stratxcel_wall: { x: 50, y: 14 },

  // Shared Amenities
  meeting_table: { x: 50, y: 55 },
  meeting_seat_west: { x: 44, y: 55 },
  meeting_seat_east: { x: 56, y: 55 },
  coffee_bar: { x: 90, y: 78 },
  lounge_sofa: { x: 82, y: 78 },

  // Workstation Desks (South Row)
  aether_desk: { x: 14, y: 78 }, // SEO
  calliope_desk: { x: 26, y: 78 }, // Content
  athena_desk: { x: 38, y: 78 }, // Research
  vulcan_desk: { x: 62, y: 78 }, // Website
  iris_desk: { x: 74, y: 78 }, // Design
  atlas_desk: { x: 86, y: 78 }, // Operations
  mercury_desk: { x: 12, y: 54 }, // WhatsApp / CRM

  // Connecting Corridors & Hallways (Clear walking paths)
  north_hallway: { x: 50, y: 44 },
  central_crossing: { x: 50, y: 66 },
  west_aisle: { x: 26, y: 66 },
  east_aisle: { x: 74, y: 66 },
  lounge_path: { x: 88, y: 66 },
  crm_hallway: { x: 14, y: 66 },
};

// Desk coordinates lookup by worker key
export function getDeskCoords(workerKey: string): { x: number; y: number } {
  switch (workerKey) {
    case "hermes":
      return OFFICE_WAYPOINTS.hermes_desk;
    case "seo_agent":
      return OFFICE_WAYPOINTS.aether_desk;
    case "content_agent":
      return OFFICE_WAYPOINTS.calliope_desk;
    case "research_agent":
      return OFFICE_WAYPOINTS.athena_desk;
    case "website_agent":
      return OFFICE_WAYPOINTS.vulcan_desk;
    case "design_agent":
      return OFFICE_WAYPOINTS.iris_desk;
    case "operations_agent":
      return OFFICE_WAYPOINTS.atlas_desk;
    case "whatsapp_agent":
      return OFFICE_WAYPOINTS.mercury_desk;
    default:
      return OFFICE_WAYPOINTS.atlas_desk;
  }
}

/**
 * Intelligent Hallway Pathfinding:
 * Ensures agents walk along real corridors and hallways instead of cutting through furniture.
 */
export function buildWaypointsPath(
  from: { x: number; y: number },
  to: { x: number; y: number }
): Array<{ x: number; y: number }> {
  // If already at target, no movement needed
  const dx = Math.abs(from.x - to.x);
  const dy = Math.abs(from.y - to.y);
  if (dx < 2 && dy < 2) return [to];

  const path: Array<{ x: number; y: number }> = [];

  // Step 1: Walk from desk into corridor
  let currentY = from.y;
  if (from.y > 70) {
    // Coming from south row of desks -> step out into central hallway
    path.push({ x: from.x, y: 66 });
    currentY = 66;
  } else if (from.y < 38) {
    // Coming from Hermes / top wall -> step down into north hallway
    path.push({ x: from.x, y: 44 });
    currentY = 44;
  }

  // Step 2: Route through major junctions if crossing north-south
  if ((currentY === 66 && to.y < 45) || (currentY === 44 && to.y > 60)) {
    path.push({ x: 50, y: 44 });
    path.push({ x: 50, y: 66 });
  }

  // Step 3: Align with target's corridor aisle
  if (to.y > 70) {
    // Heading to south row of desks
    path.push({ x: to.x, y: 66 });
  } else if (to.y < 38) {
    // Heading to Hermes / Wall
    path.push({ x: to.x, y: 44 });
  }

  // Final destination
  path.push({ x: to.x, y: to.y });

  return path;
}

/**
 * Initializes the visual simulation workers from real telemetry
 */
export function initializeSimulationWorkers(workers: LiveWorker[]): SimulationWorkerState[] {
  return workers.map((w) => {
    const desk = getDeskCoords(w.key);
    const isHermes = w.key === "hermes";
    const isWorking = w.state === "WORKING";

    return {
      key: w.key,
      name: w.name,
      department: w.department,
      x: desk.x,
      y: desk.y,
      destX: desk.x,
      destY: desk.y,
      waypoints: [],
      posture: "SEATED",
      facing: isHermes ? "right" : desk.x < 50 ? "right" : "left",
      activity: isWorking ? "TYPING" : "STANDBY_IDLE",
      currentLocation: "DESK",
      holdingArtifact: null,
      assignedMission: null,
      accentColor: w.accentColor,
      secondaryColor: w.secondaryColor,
      isMoving: false,
    };
  });
}

/**
 * Dispatches an event into the simulation state
 */
export function dispatchSimulationEvent(
  event: OfficeEvent,
  workerStates: SimulationWorkerState[],
  activeMissions: OfficeMission[],
  artifacts: PhysicalArtifact[]
): SimulationWorkerState[] {
  return workerStates.map((worker) => {
    // 1. If worker is assigned a new mission -> Walk to desk & sit down to work
    if (event.type === "MISSION_ASSIGNED" && worker.key === event.targetWorkerKey) {
      const desk = getDeskCoords(worker.key);
      const mission = activeMissions.find((m) => m.id === event.missionId) || null;
      const path = buildWaypointsPath({ x: worker.x, y: worker.y }, desk);

      return {
        ...worker,
        destX: desk.x,
        destY: desk.y,
        waypoints: path,
        posture: path.length > 1 ? "WALKING" : "SEATED",
        activity: path.length > 1 ? "STANDBY_IDLE" : "TYPING",
        isMoving: path.length > 1,
        facing: desk.x > worker.x ? "right" : "left",
        assignedMission: mission,
        holdingArtifact: null,
      };
    }

    // 2. If artifact is created / handoff -> Walk to target worker and hand off
    if (event.type === "ARTIFACT_HANDOFF" && worker.key === event.workerKey) {
      const targetWorker = workerStates.find((w) => w.key === event.targetWorkerKey);
      const targetDesk = targetWorker
        ? getDeskCoords(targetWorker.key)
        : OFFICE_WAYPOINTS.meeting_table;

      // Calculate meeting point near target
      const handoffPoint = {
        x: targetDesk.x + (targetDesk.x < 50 ? 5 : -5),
        y: targetDesk.y > 60 ? 66 : targetDesk.y,
      };

      const path = buildWaypointsPath({ x: worker.x, y: worker.y }, handoffPoint);
      const artifact = artifacts.find((a) => a.id === event.artifactId);

      return {
        ...worker,
        destX: handoffPoint.x,
        destY: handoffPoint.y,
        waypoints: path,
        posture: "CARRYING",
        activity: "HANDOFF_GESTURE",
        isMoving: true,
        facing: handoffPoint.x > worker.x ? "right" : "left",
        holdingArtifact: {
          label: artifact?.label || "REPORT",
          kind: artifact?.kind || "document",
        },
      };
    }

    // 3. If mission completed -> Return to desk & celebratory nod
    if (event.type === "MISSION_COMPLETED" && worker.key === event.workerKey) {
      const desk = getDeskCoords(worker.key);
      const path = buildWaypointsPath({ x: worker.x, y: worker.y }, desk);

      return {
        ...worker,
        destX: desk.x,
        destY: desk.y,
        waypoints: path,
        posture: path.length > 1 ? "WALKING" : "SEATED",
        activity: "STANDBY_IDLE",
        isMoving: path.length > 1,
        assignedMission: null,
        holdingArtifact: null,
      };
    }

    return worker;
  });
}

/**
 * Triggers a natural ambient movement for an idle worker (Coffee break or whiteboard inspection)
 */
export function triggerAmbientLifeEvent(
  workerStates: SimulationWorkerState[],
  idleWorkerKey: string
): SimulationWorkerState[] {
  return workerStates.map((worker) => {
    if (worker.key !== idleWorkerKey || worker.isMoving || worker.assignedMission) {
      return worker;
    }

    const desk = getDeskCoords(worker.key);
    const isAtDesk = Math.abs(worker.x - desk.x) < 2 && Math.abs(worker.y - desk.y) < 2;

    if (isAtDesk) {
      // Choose ambient destination: Coffee bar or Mission board
      const isCoffee = Math.random() > 0.4;
      const target = isCoffee ? OFFICE_WAYPOINTS.coffee_bar : OFFICE_WAYPOINTS.mission_board;
      const path = buildWaypointsPath({ x: worker.x, y: worker.y }, target);

      return {
        ...worker,
        destX: target.x,
        destY: target.y,
        waypoints: path,
        posture: "WALKING",
        activity: isCoffee ? "COFFEE_BREAK" : "INSPECTING_BOARD",
        currentLocation: isCoffee ? "COFFEE_LOUNGE" : "MISSION_BOARD",
        isMoving: true,
        facing: target.x > worker.x ? "right" : "left",
      };
    } else {
      // Returning to desk from break
      const path = buildWaypointsPath({ x: worker.x, y: worker.y }, desk);
      return {
        ...worker,
        destX: desk.x,
        destY: desk.y,
        waypoints: path,
        posture: "WALKING",
        activity: "STANDBY_IDLE",
        currentLocation: "DESK",
        isMoving: true,
        facing: desk.x > worker.x ? "right" : "left",
      };
    }
  });
}
