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
    | "KITCHEN_BREAK"
    | "GAMING"
    | "RELAXING"
    | "INSPECTING_BOARD"
    | "MEETING_CHAIRING"
    | "MEETING_DISCUSSING"
    | "HANDOFF_GESTURE"
    | "STANDBY_IDLE";
  currentLocation: WorkerLocation;
  holdingArtifact: { label: string; kind: string } | null;
  assignedMission: OfficeMission | null;
  accentColor: string;
  secondaryColor: string;
  isMoving: boolean;
}

// Canonical Spatial Waypoints (in % coordinates across the 14 company zones)
export const OFFICE_WAYPOINTS = {
  // 1. CEO Executive Suite (Top Center)
  hermes_desk: { x: 50, y: 22 },
  hermes_terrace: { x: 50, y: 14 },

  // 2. Meeting Room (Center Stage)
  meeting_table: { x: 50, y: 44 },
  meeting_seat_north: { x: 50, y: 39 },
  meeting_seat_south: { x: 50, y: 49 },
  meeting_seat_west: { x: 44, y: 44 },
  meeting_seat_east: { x: 56, y: 44 },

  // 3-10. Work Department Desks
  sales_desk: { x: 16, y: 64 }, // Sales & Deals (Mercury)
  crm_desk: { x: 28, y: 64 }, // CRM & Support (Vesta)
  research_desk: { x: 40, y: 64 }, // Market Intelligence (Athena)
  seo_desk: { x: 60, y: 64 }, // SEO & Discovery (Aether)
  marketing_desk: { x: 72, y: 64 }, // Marketing & Campaigns (Calliope)
  finance_desk: { x: 84, y: 64 }, // Finance & Ledger (Plutus)

  engineering_desk: { x: 22, y: 84 }, // Engineering (Vulcan)
  operations_desk: { x: 50, y: 84 }, // Cloud Fleet Ops (Atlas)
  people_desk: { x: 78, y: 84 }, // People & HR (Hestia)

  // Backward-compatible named desk aliases
  aether_desk: { x: 60, y: 64 },
  calliope_desk: { x: 72, y: 64 },
  athena_desk: { x: 40, y: 64 },
  vulcan_desk: { x: 22, y: 84 },
  atlas_desk: { x: 50, y: 84 },
  mercury_desk: { x: 16, y: 64 },
  iris_desk: { x: 28, y: 64 },

  // 11-14. Non-Work Amenities (Honest Breaks)
  kitchen_counter: { x: 12, y: 20 }, // Kitchen / Break Area (North-West)
  kitchen_table: { x: 18, y: 26 },
  gaming_arcade: { x: 10, y: 44 }, // Gaming Room (Mid-West)
  gaming_couch: { x: 16, y: 44 },
  coffee_bar: { x: 88, y: 20 }, // Coffee Lounge (North-East)
  coffee_lounge_seat: { x: 84, y: 26 },
  relaxation_beanbag: { x: 90, y: 44 }, // Relaxation Area (Mid-East)
  relaxation_garden: { x: 84, y: 44 },

  // Architectural Markers
  mission_board: { x: 74, y: 14 },
  stratxcel_wall: { x: 50, y: 10 },

  // Connecting Corridors & Hallways (Clear path routing)
  north_hallway: { x: 50, y: 31 },
  central_crossing: { x: 50, y: 55 },
  south_hallway: { x: 50, y: 74 },
  west_cross_aisle: { x: 28, y: 55 },
  east_cross_aisle: { x: 72, y: 55 },
  west_outer_corridor: { x: 14, y: 34 },
  east_outer_corridor: { x: 86, y: 34 },
};

// Desk coordinates lookup by worker key
export function getDeskCoords(workerKey: string): { x: number; y: number } {
  switch (workerKey) {
    case "hermes":
      return OFFICE_WAYPOINTS.hermes_desk;
    case "whatsapp_agent":
    case "sales_agent":
      return OFFICE_WAYPOINTS.sales_desk;
    case "crm_agent":
      return OFFICE_WAYPOINTS.crm_desk;
    case "research_agent":
      return OFFICE_WAYPOINTS.research_desk;
    case "seo_agent":
      return OFFICE_WAYPOINTS.seo_desk;
    case "content_agent":
    case "marketing_agent":
      return OFFICE_WAYPOINTS.marketing_desk;
    case "finance_agent":
      return OFFICE_WAYPOINTS.finance_desk;
    case "website_agent":
    case "engineering_agent":
      return OFFICE_WAYPOINTS.engineering_desk;
    case "operations_agent":
      return OFFICE_WAYPOINTS.operations_desk;
    case "people_agent":
      return OFFICE_WAYPOINTS.people_desk;
    case "design_agent":
      return OFFICE_WAYPOINTS.crm_desk;
    default:
      return OFFICE_WAYPOINTS.operations_desk;
  }
}

/**
 * Intelligent Architectural Pathfinding:
 * Ensures agents navigate along dedicated corridors without clipping through furniture or glass walls.
 */
export function buildWaypointsPath(
  from: { x: number; y: number },
  to: { x: number; y: number }
): Array<{ x: number; y: number }> {
  const dx = Math.abs(from.x - to.x);
  const dy = Math.abs(from.y - to.y);
  if (dx < 2 && dy < 2) return [to];

  const path: Array<{ x: number; y: number }> = [];

  // Step 1: Step out into the nearest corridor line
  let currentY = from.y;
  if (from.y > 76) {
    // Coming from deep south row (Engineering, Operations, People)
    path.push({ x: from.x, y: 74 });
    currentY = 74;
  } else if (from.y > 58) {
    // Coming from mid-south row (Sales, Research, Marketing, Finance)
    path.push({ x: from.x, y: 55 });
    currentY = 55;
  } else if (from.y < 30) {
    // Coming from north row (Hermes, Coffee, Kitchen)
    path.push({ x: from.x, y: 31 });
    currentY = 31;
  }

  // Step 2: Route through central north-south spine if changing levels
  if ((currentY === 74 && to.y < 70) || (currentY < 40 && to.y > 50)) {
    path.push({ x: 50, y: currentY });
    path.push({ x: 50, y: to.y > 70 ? 74 : to.y > 50 ? 55 : 31 });
  } else if (currentY === 55 && to.y > 70) {
    path.push({ x: 50, y: 55 });
    path.push({ x: 50, y: 74 });
  } else if (currentY === 55 && to.y < 40) {
    path.push({ x: 50, y: 55 });
    path.push({ x: 50, y: 31 });
  }

  // Step 3: Align horizontally with target's corridor aisle
  if (to.y > 76) {
    path.push({ x: to.x, y: 74 });
  } else if (to.y > 58) {
    path.push({ x: to.x, y: 55 });
  } else if (to.y < 30) {
    path.push({ x: to.x, y: 31 });
  }

  // Step 4: Final arrival at destination
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
    const isWorking =
      w.state === "WORKING" ||
      w.state === "SEARCHING" ||
      w.state === "ANALYZING" ||
      w.state === "PLANNING" ||
      w.state === "GENERATING";

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
    // 1. MEETING CALLED: Hermes and assigned specialists move to Meeting Room
    if (event.type === "MEETING_CALLED") {
      if (worker.key === "hermes") {
        const target = OFFICE_WAYPOINTS.meeting_seat_north;
        const path = buildWaypointsPath({ x: worker.x, y: worker.y }, target);
        return {
          ...worker,
          destX: target.x,
          destY: target.y,
          waypoints: path,
          posture: path.length > 1 ? "WALKING" : "SEATED",
          activity: "MEETING_CHAIRING",
          currentLocation: "MEETING_TABLE",
          isMoving: path.length > 1,
          facing: "right",
        };
      }

      if (worker.key === event.targetWorkerKey || worker.key === event.workerKey) {
        const target = OFFICE_WAYPOINTS.meeting_seat_west;
        const path = buildWaypointsPath({ x: worker.x, y: worker.y }, target);
        return {
          ...worker,
          destX: target.x,
          destY: target.y,
          waypoints: path,
          posture: path.length > 1 ? "WALKING" : "SEATED",
          activity: "MEETING_DISCUSSING",
          currentLocation: "MEETING_TABLE",
          isMoving: path.length > 1,
          facing: target.x > worker.x ? "right" : "left",
        };
      }
    }

    // 2. MISSION ASSIGNED: Workers return from meeting room to their department desk
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
        currentLocation: "DESK",
        isMoving: path.length > 1,
        facing: desk.x > worker.x ? "right" : "left",
        assignedMission: mission,
        holdingArtifact: null,
      };
    }

    // 3. ARTIFACT HANDOFF: Worker walks to target department to deliver deliverable
    if (event.type === "ARTIFACT_HANDOFF" && worker.key === event.workerKey) {
      const targetWorker = workerStates.find((w) => w.key === event.targetWorkerKey);
      const targetDesk = targetWorker
        ? getDeskCoords(targetWorker.key)
        : OFFICE_WAYPOINTS.hermes_desk;

      const handoffPoint = {
        x: targetDesk.x + (targetDesk.x < 50 ? 5 : -5),
        y: targetDesk.y > 60 ? targetDesk.y - 4 : targetDesk.y + 4,
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
          label: artifact?.label || "DELIVERABLE",
          kind: artifact?.kind || "document",
        },
      };
    }

    // 4. MISSION COMPLETED: Return to desk & celebratory standby
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
        currentLocation: "DESK",
        isMoving: path.length > 1,
        assignedMission: null,
        holdingArtifact: null,
      };
    }

    return worker;
  });
}

/**
 * Triggers honest ambient movement for an idle worker across the 4 non-work areas:
 * Coffee Lounge, Kitchen/Break, Gaming Room, and Relaxation Area.
 * Strictly honest: Never displays fake work or fake progress.
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
      // Pick one of the 4 authentic non-work areas
      const rand = Math.random();
      let target = OFFICE_WAYPOINTS.coffee_bar;
      let activity: SimulationWorkerState["activity"] = "COFFEE_BREAK";
      let currentLocation: WorkerLocation = "COFFEE_LOUNGE";
      let posture: WorkerPosture = "STANDING";

      if (rand < 0.25) {
        target = OFFICE_WAYPOINTS.coffee_bar;
        activity = "COFFEE_BREAK";
        currentLocation = "COFFEE_LOUNGE";
        posture = "STANDING";
      } else if (rand < 0.5) {
        target = OFFICE_WAYPOINTS.kitchen_counter;
        activity = "KITCHEN_BREAK";
        currentLocation = "KITCHEN_BREAK";
        posture = "STANDING";
      } else if (rand < 0.75) {
        target = OFFICE_WAYPOINTS.gaming_arcade;
        activity = "GAMING";
        currentLocation = "GAMING_ROOM";
        posture = "STANDING";
      } else {
        target = OFFICE_WAYPOINTS.relaxation_beanbag;
        activity = "RELAXING";
        currentLocation = "RELAXATION_AREA";
        posture = "SEATED";
      }

      const path = buildWaypointsPath({ x: worker.x, y: worker.y }, target);

      return {
        ...worker,
        destX: target.x,
        destY: target.y,
        waypoints: path,
        posture: "WALKING",
        activity,
        currentLocation,
        isMoving: true,
        facing: target.x > worker.x ? "right" : "left",
      };
    } else {
      // Returning from honest break back to desk
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
