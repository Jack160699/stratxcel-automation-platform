import { assertNoExternalMutationFromPlanAlone } from "../security/narrowing.ts";
import type { SeoArticleDraft, SeoPublishRequest } from "./types.ts";

export function createSeoPublishRequest(input: {
  tenantId: string;
  articleDraft: SeoArticleDraft;
}): SeoPublishRequest {
  return {
    kind: "seo_publish_request",
    id: `seo_publish_request_${crypto.randomUUID()}`,
    tenantId: input.tenantId,
    articleDraftId: input.articleDraft.id,
    productionPublishAuthorized: false,
    requiresApproval: true,
  };
}

/** Generation alone never authorizes production SEO publish. */
export function rejectSeoPublishFromGenerationAlone(): never {
  assertNoExternalMutationFromPlanAlone("seo.publish", false);
  throw new Error("unreachable_seo_publish_gate");
}
