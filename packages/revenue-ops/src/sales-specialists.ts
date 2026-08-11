import type { LeadIntelligence, LeadQualificationArtifact } from "./types.ts";

export type SalesSpecialistRole =
  | "qualification"
  | "objection_handling"
  | "proposal_strategy"
  | "pipeline_analysis"
  | "sales_follow_up";

export interface SalesSpecialistOutput {
  role: SalesSpecialistRole;
  summary: string;
  recommendedActions: readonly string[];
  deceptivePersuasion: false;
  requiresHumanReview: boolean;
  unknownAreas: readonly string[];
}

/** Sales specialists — advisory only. No deceptive persuasion automation. */
export function runSalesSpecialist(input: {
  role: SalesSpecialistRole;
  intelligence: LeadIntelligence;
  qualification?: LeadQualificationArtifact | null;
  objections?: readonly string[];
  pipelineCounts?: Partial<Record<"NEW" | "CONTACTED" | "QUALIFIED" | "WON" | "LOST", number>>;
}): SalesSpecialistOutput {
  const unknown: string[] = [];
  if (input.intelligence.intent.status === "unknown") unknown.push("intent");
  if (input.intelligence.serviceInterest.status === "unknown") unknown.push("serviceInterest");

  switch (input.role) {
    case "qualification":
      return {
        role: "qualification",
        summary: input.qualification?.rationale ?? "Run evidence-based qualification",
        recommendedActions: [
          "Ask clarifying questions for unknown fields",
          "Do not invent budget or urgency",
          input.qualification?.decision === "insufficient_evidence"
            ? "Escalate unclear intent to human"
            : "Update CRM status only after evidence-backed decision",
        ],
        deceptivePersuasion: false,
        requiresHumanReview: input.qualification?.decision === "insufficient_evidence",
        unknownAreas: unknown,
      };
    case "objection_handling": {
      const objections = input.objections ?? [];
      return {
        role: "objection_handling",
        summary: objections.length
          ? `Address observed objections: ${objections.join("; ")}`
          : "No objections on record — do not invent them",
        recommendedActions: objections.length
          ? ["Acknowledge the objection honestly", "Offer facts already on record only", "Escalate pricing/legal disputes to human"]
          : ["Wait for customer-stated objections before responding"],
        deceptivePersuasion: false,
        requiresHumanReview: true,
        unknownAreas: objections.length ? [] : ["objections"],
      };
    }
    case "proposal_strategy":
      return {
        role: "proposal_strategy",
        summary: "Draft proposal from known service interest and brand facts only",
        recommendedActions: ["Use known serviceInterest when present", "Omit pricing unless recorded", "Require human approval before send"],
        deceptivePersuasion: false,
        requiresHumanReview: true,
        unknownAreas: unknown,
      };
    case "pipeline_analysis": {
      const counts = input.pipelineCounts ?? {};
      const parts = Object.entries(counts).map(([k, v]) => `${k}:${v}`);
      return {
        role: "pipeline_analysis",
        summary: parts.length ? `Pipeline snapshot ${parts.join(", ")}` : "No pipeline counts provided",
        recommendedActions: ["Prioritize NEW and overdue follow-ups", "Do not fabricate win rates"],
        deceptivePersuasion: false,
        requiresHumanReview: false,
        unknownAreas: parts.length ? [] : ["pipeline_counts"],
      };
    }
    case "sales_follow_up":
      return {
        role: "sales_follow_up",
        summary: "Coordinate CRM follow-up plan with WhatsApp drafts under consent",
        recommendedActions: [
          "Use crm_followup_plan artifact",
          "Never treat Hermes text as send authorization",
          "Stop on opt-out",
        ],
        deceptivePersuasion: false,
        requiresHumanReview: false,
        unknownAreas: unknown,
      };
  }
}
