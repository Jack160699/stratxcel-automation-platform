export const IMAGE_ASPECT_RATIOS = ["1:1", "4:5", "9:16", "16:9"] as const;
export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number];

export const IMAGE_JOB_STATUSES = [
  "DRAFT",
  "QUEUED",
  "PROCESSING",
  "REVIEWING",
  "REVISING",
  "READY",
  "FAILED",
] as const;
export type ImageJobStatus = (typeof IMAGE_JOB_STATUSES)[number];

export type ImageSourceContext =
  | "creative_studio"
  | "social_copilot"
  | "social_autopilot"
  | "workforce"
  | "campaign"
  | "website";

export interface ImageGenerationJobRow {
  id: string;
  tenant_id: string;
  actor_user_id: string;
  mission_id: string | null;
  source_context: ImageSourceContext;
  source_id: string | null;
  idempotency_key: string;
  status: ImageJobStatus;
  brief: string;
  normalized_prompt: string | null;
  intended_use: "social_post" | "campaign" | "website" | "ad_creative" | "general";
  aspect_ratio: ImageAspectRatio;
  candidate_count: number;
  style_direction: string | null;
  brand_brain_version: number | null;
  brand_context_snapshot: Record<string, unknown>;
  /** Real structured Creative Treatment (lib/social/creative-treatment.ts)
   * driving this job's image prompt, when one was supplied and passed
   * validateCreativeTreatment -- null for a plain free-text brief. */
  creative_treatment: Record<string, unknown> | null;
  provider: string | null;
  model: string | null;
  provider_request_id: string | null;
  selected_candidate_id: string | null;
  estimated_cost_usd: number | null;
  actual_cost_usd: number | null;
  usage_accounting_status: "RECORDED" | "FAILED" | "SKIPPED" | null;
  error_code: string | null;
  safe_error: string | null;
  error_retryable: boolean | null;
  revision_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface ImageGenerationCandidateRow {
  id: string;
  job_id: string;
  tenant_id: string;
  asset_id: string;
  parent_candidate_id: string | null;
  status: "GENERATED" | "REVIEWED" | "SELECTED" | "REJECTED" | "REVISION";
  revision_number: number;
  provider: string;
  model: string;
  provider_output_id: string | null;
  mime_type: string;
  width: number | null;
  height: number | null;
  estimated_cost_usd: number | null;
  critique: Record<string, unknown>;
  provenance: Record<string, unknown>;
  /** True when this candidate's on-image headline/CTA/brand text was
   * composited deterministically (text-overlay-render.ts) rather than
   * rendered by the image model. */
  text_overlay_applied: boolean;
  created_at: string;
  preview_url?: string | null;
}

export interface CreateImageJobInput {
  tenantId: string;
  actorUserId: string;
  brief: string;
  idempotencyKey: string;
  intendedUse?: ImageGenerationJobRow["intended_use"];
  aspectRatio?: ImageAspectRatio;
  candidateCount?: number;
  styleDirection?: string | null;
  referenceAssetIds?: readonly string[];
  sourceContext?: ImageSourceContext;
  sourceId?: string | null;
  missionId?: string | null;
  /** Real structured Creative Treatment (lib/social/creative-treatment.ts).
   * When supplied and structurally valid, processImageGenerationJob builds
   * the actual image prompt from it (visual-director-prompt.ts) instead of
   * `brief` alone, and applies deterministic text-overlay compositing for
   * any on-image text it specifies. A malformed treatment is discarded
   * (logged, not silently trusted) -- the job still proceeds from `brief`. */
  treatment?: Record<string, unknown> | null;
}

export interface ImageJobDetail {
  job: ImageGenerationJobRow;
  candidates: ImageGenerationCandidateRow[];
  references: Array<{ asset_id: string; reference_kind: string }>;
}
