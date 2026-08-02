export interface MissionSubmission {
  tenantId: string;
  goalText: string;
  leadId: string;
  createdBy: null;
}

export interface MissionQueue {
  submit(input: MissionSubmission): Promise<{ queued: boolean }>;
}

/**
 * Placeholder queue: logs and returns immediately. This app's job is to
 * receive, verify, and normalize WhatsApp webhooks fast (Meta expects a
 * 200 within seconds) — it must never call createAndEstimateMission
 * in-process, since that's exactly the "long-running logic inside a
 * webhook request" pattern this app was split out to avoid. A real queue
 * (a Postgres-backed missions_inbox table that apps/mission-worker polls,
 * or a managed queue like SQS/Cloud Tasks) is required before this is
 * wired to anything live — deliberately not decided here since it's an
 * infrastructure choice with cost/ops implications, not a code-shape one.
 */
export function createLoggingMissionQueue(): MissionQueue {
  return {
    async submit(input) {
      console.log("[whatsapp-worker] would enqueue mission:", input);
      return { queued: true };
    },
  };
}
