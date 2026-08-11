/**
 * Social Department — WorkforceCore execution adapters.
 * Consumes upstream final artifacts; does not rebuild Social from scratch.
 */

export * from "./types.ts";
export * from "./release-artifact.ts";
export * from "./platform-adaptation.ts";
export * from "./tenant-scope.ts";
export * from "./artifact-resolution.ts";
export * from "./schedule.ts";
export * from "./week-planner.ts";
export * from "./authorization.ts";
export * from "./trust-release-gate.ts";
export * from "./publication-status.ts";
export * from "./publication-status-lookup.ts";
export * from "./receipt.ts";
export * from "./usage.ts";
export * from "./analytics-handoff.ts";
export * from "./package-plan.ts";
export * from "./handoffs.ts";
export * from "./retry.ts";
export * from "./calendar.ts";
export * from "./whatsapp-bridge-contract.ts";
export * from "./capability-host.ts";
