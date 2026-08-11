import { assertNoExternalMutationFromPlanAlone } from "../security/narrowing.ts";
import type { DeploymentRequest, WebsitePreview } from "./types.ts";

export class DeployFromModelTextError extends Error {
  readonly code = "deploy_from_model_text_rejected";
  constructor(message = "deploy_from_model_text_rejected") {
    super(message);
    this.name = "DeployFromModelTextError";
  }
}

export function createWebsitePreview(input: {
  tenantId: string;
  revisionId: string;
  previewUrl?: string;
}): WebsitePreview {
  return {
    kind: "website_preview",
    id: `website_preview_${crypto.randomUUID()}`,
    tenantId: input.tenantId,
    revisionId: input.revisionId,
    boundDeployCandidateId: `deploy_candidate_${input.revisionId}`,
    previewUrl: input.previewUrl,
  };
}

export function createDeploymentRequest(input: {
  tenantId: string;
  revisionId: string;
  preview: WebsitePreview;
}): DeploymentRequest {
  if (input.preview.revisionId !== input.revisionId) {
    throw new Error("preview_revision_mismatch");
  }
  if (input.preview.boundDeployCandidateId !== `deploy_candidate_${input.revisionId}`) {
    throw new Error("preview_deploy_candidate_mismatch");
  }
  return {
    kind: "deployment_request",
    id: `deployment_request_${crypto.randomUUID()}`,
    tenantId: input.tenantId,
    revisionId: input.revisionId,
    boundDeployCandidateId: input.preview.boundDeployCandidateId,
    productionDeployAuthorized: false,
    requiresApproval: true,
  };
}

/** Model-generated free text cannot authorize a production deploy. */
export function assertNoDeployFromModelText(modelText: string): void {
  const lower = modelText.toLowerCase();
  if (
    /deploy\s+to\s+production/.test(lower) ||
    /production\s+deploy/.test(lower) ||
    /go\s+live\s+now/.test(lower) ||
    /publish\s+the\s+site/.test(lower)
  ) {
    throw new DeployFromModelTextError();
  }
}

export function rejectProductionDeployFromPlanAlone(): never {
  assertNoExternalMutationFromPlanAlone("website.deploy", false);
  throw new Error("unreachable_website_deploy_gate");
}
