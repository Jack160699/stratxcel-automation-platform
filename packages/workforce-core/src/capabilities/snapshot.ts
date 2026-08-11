import { CAPABILITY_KEYS, type CapabilityKey, type CapabilityStatus } from "./types.ts";
import { listCapabilities } from "./registry.ts";
import {
  resolveCapabilityReadiness,
  type CapabilityReadinessInput,
} from "./readiness.ts";

/**
 * Safe planner-facing summary — no credentials, secrets, or internal URLs.
 */
export type PlannerCapabilityAvailability =
  | "AVAILABLE"
  | "NOT_READY"
  | "SETUP_REQUIRED"
  | "PLANNED"
  | "UNAVAILABLE";

export interface CapabilityPlannerEntry {
  key: CapabilityKey;
  label: string;
  availability: PlannerCapabilityAvailability;
  implementationStatus: CapabilityStatus;
  externalMutation: boolean;
  approvalRequired: boolean;
  reasonCode: string;
  humanReason: string;
}

export interface CapabilityPlannerSnapshot {
  evaluatedAt: string;
  entries: readonly CapabilityPlannerEntry[];
  /** Convenience lists for Hermes CEO / Business Growth Planner. */
  availableKeys: readonly CapabilityKey[];
  notReadyKeys: readonly CapabilityKey[];
  plannedKeys: readonly CapabilityKey[];
  unavailableKeys: readonly CapabilityKey[];
  setupRequiredKeys: readonly CapabilityKey[];
}

function mapStaticToPlanner(status: CapabilityStatus): PlannerCapabilityAvailability {
  switch (status) {
    case "AVAILABLE":
      return "AVAILABLE";
    case "PLANNED":
      return "PLANNED";
    case "UNAVAILABLE":
      return "UNAVAILABLE";
    case "NOT_CONFIGURED":
      return "SETUP_REQUIRED";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function mapRuntimeToPlanner(
  implementationStatus: CapabilityStatus,
  readiness: ReturnType<typeof resolveCapabilityReadiness>,
): PlannerCapabilityAvailability {
  if (implementationStatus === "PLANNED") return "PLANNED";
  if (implementationStatus === "UNAVAILABLE") return "UNAVAILABLE";
  if (implementationStatus === "NOT_CONFIGURED") return "SETUP_REQUIRED";
  if (readiness.executable) return "AVAILABLE";
  if (
    readiness.readiness === "SETUP_REQUIRED" ||
    readiness.readiness === "WAITING_CONFIGURATION" ||
    readiness.readiness === "WAITING_INTEGRATION"
  ) {
    return "SETUP_REQUIRED";
  }
  return "NOT_READY";
}

/**
 * Static catalogue snapshot for planners (no tenant runtime).
 * NEVER use as execution authorization.
 */
export function buildStaticCapabilityPlannerSnapshot(): CapabilityPlannerSnapshot {
  const entries: CapabilityPlannerEntry[] = listCapabilities().map((def) => {
    const availability = mapStaticToPlanner(def.status);
    return {
      key: def.key,
      label: def.label,
      availability,
      implementationStatus: def.status,
      externalMutation: def.externalMutation,
      approvalRequired: def.approvalRequired,
      reasonCode: def.status,
      humanReason: `Static catalogue status: ${def.status}`,
    };
  });
  return summarize(entries);
}

/**
 * Tenant-aware planner snapshot. Still NEVER authorizes execution.
 */
export function buildCapabilityPlannerSnapshot(
  input: Omit<CapabilityReadinessInput, "capabilityKey" | "requestedOperation" | "fromPlannerSnapshot">,
): CapabilityPlannerSnapshot {
  const entries: CapabilityPlannerEntry[] = [];
  for (const key of CAPABILITY_KEYS) {
    const readiness = resolveCapabilityReadiness({
      ...input,
      capabilityKey: key,
      requestedOperation: "plan",
      fromPlannerSnapshot: true,
    });
    const implementationStatus =
      readiness.implementationStatus === "UNKNOWN" ? "UNAVAILABLE" : readiness.implementationStatus;
    entries.push({
      key,
      label: listCapabilities().find((c) => c.key === key)?.label ?? key,
      availability: mapRuntimeToPlanner(implementationStatus, readiness),
      implementationStatus,
      externalMutation: readiness.externalMutation,
      approvalRequired: readiness.approvalRequired,
      reasonCode: readiness.reasonCode,
      humanReason: readiness.humanReason,
    });
  }
  return summarize(entries);
}

function summarize(entries: CapabilityPlannerEntry[]): CapabilityPlannerSnapshot {
  return {
    evaluatedAt: new Date().toISOString(),
    entries,
    availableKeys: entries.filter((e) => e.availability === "AVAILABLE").map((e) => e.key),
    notReadyKeys: entries.filter((e) => e.availability === "NOT_READY").map((e) => e.key),
    plannedKeys: entries.filter((e) => e.availability === "PLANNED").map((e) => e.key),
    unavailableKeys: entries.filter((e) => e.availability === "UNAVAILABLE").map((e) => e.key),
    setupRequiredKeys: entries.filter((e) => e.availability === "SETUP_REQUIRED").map((e) => e.key),
  };
}
