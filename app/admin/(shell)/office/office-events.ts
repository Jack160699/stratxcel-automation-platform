import type {
  LiveWorker,
  OfficeMission,
  PhysicalArtifact,
  OfficeEvent,
  OfficeEventType,
} from "./office-types";

/**
 * Normalized Office Event Engine
 * Converts raw backend telemetry diffs into visual workforce events.
 */

export function detectOfficeEvents(
  prevTelemetry: {
    workers: LiveWorker[];
    activeMissions: OfficeMission[];
    artifacts: PhysicalArtifact[];
  } | null,
  currTelemetry: {
    workers: LiveWorker[];
    activeMissions: OfficeMission[];
    artifacts: PhysicalArtifact[];
  }
): OfficeEvent[] {
  const events: OfficeEvent[] = [];
  const now = new Date().toISOString();

  if (!prevTelemetry) {
    // Initial load: generate initial status events for any active missions
    for (const mission of currTelemetry.activeMissions) {
      if (mission.state === "RUNNING") {
        events.push({
          id: `init-run-${mission.id}`,
          type: "MISSION_ASSIGNED",
          timestamp: now,
          workerKey: mission.assignedWorkerKey,
          targetWorkerKey: mission.assignedWorkerKey,
          missionId: mission.id,
          label: `Mission active: ${mission.goal.slice(0, 45)}`,
          importance: "HIGH",
        });
      }
    }
    return events;
  }

  // 1. Check for New or Updated Missions
  for (const currMission of currTelemetry.activeMissions) {
    const prevMission = prevTelemetry.activeMissions.find((m) => m.id === currMission.id);

    if (!prevMission) {
      // Brand new mission created by Founder / Hermes
      events.push({
        id: `ev-new-${currMission.id}-${Date.now()}`,
        type: "MISSION_ASSIGNED",
        timestamp: now,
        workerKey: "hermes",
        targetWorkerKey: currMission.assignedWorkerKey,
        missionId: currMission.id,
        label: `Hermes assigned: ${currMission.goal.slice(0, 45)}`,
        importance: "HIGH",
      });
    } else if (prevMission.state !== currMission.state) {
      if (currMission.state === "COMPLETED") {
        events.push({
          id: `ev-done-${currMission.id}-${Date.now()}`,
          type: "MISSION_COMPLETED",
          timestamp: now,
          workerKey: currMission.assignedWorkerKey,
          targetWorkerKey: "hermes",
          missionId: currMission.id,
          label: `Delivered: ${currMission.goal.slice(0, 45)}`,
          importance: "HIGH",
        });
      } else if (currMission.state === "BLOCKED") {
        events.push({
          id: `ev-block-${currMission.id}-${Date.now()}`,
          type: "WORKER_BLOCKED",
          timestamp: now,
          workerKey: currMission.assignedWorkerKey,
          targetWorkerKey: "hermes",
          missionId: currMission.id,
          label: `Approval required for ${currMission.assignedWorkerName}`,
          importance: "HIGH",
        });
      }
    }
  }

  // 2. Check for Newly Generated Artifacts (Triggers Physical Handoff)
  for (const currArt of currTelemetry.artifacts) {
    const prevArt = prevTelemetry.artifacts.find((a) => a.id === currArt.id);
    if (!prevArt) {
      events.push({
        id: `ev-art-${currArt.id}-${Date.now()}`,
        type: currArt.toWorkerKey ? "ARTIFACT_HANDOFF" : "ARTIFACT_CREATED",
        timestamp: now,
        workerKey: currArt.fromWorkerKey,
        targetWorkerKey: currArt.toWorkerKey || "hermes",
        missionId: currArt.missionId,
        artifactId: currArt.id,
        label: `Deliverable generated: ${currArt.label}`,
        importance: "HIGH",
      });
    }
  }

  // 3. Check for Worker Status Changes
  for (const currWorker of currTelemetry.workers) {
    const prevWorker = prevTelemetry.workers.find((w) => w.id === currWorker.id);
    if (prevWorker && prevWorker.state !== currWorker.state) {
      events.push({
        id: `ev-state-${currWorker.id}-${Date.now()}`,
        type: currWorker.state === "WORKING" ? "WORKER_ACTIVATED" : "WORKER_STATUS_CHANGED",
        timestamp: now,
        workerKey: currWorker.key,
        label: `${currWorker.name} changed status to ${currWorker.state}`,
        importance: currWorker.state === "WORKING" ? "MEDIUM" : "LOW",
      });
    }
  }

  return events;
}
