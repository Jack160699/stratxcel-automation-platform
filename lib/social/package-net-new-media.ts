import type { ServiceClient } from "@stratxcel/whatsapp";
import type { CreativeTreatment } from "./creative-treatment.ts";

// Deliberately a dynamic import, resolved inside the function below rather
// than a static top-level import: lib/image-generation/service.ts begins
// with `import "server-only"` (throws outside Next's real bundler -- by
// design, to catch an accidental client-bundle inclusion) and, separately,
// carries a TS parameter-property constructor
// (ImageGenerationServiceError) that --experimental-strip-types (the flag
// every `npm run test:*` script in this repo uses) cannot parse. Before
// this file existed, nothing in lib/social/** ever imported
// lib/image-generation/service.ts, so neither issue was reachable from any
// existing social-autopilot test. A static import here would make EVERY
// test that merely imports package-autopilot.ts -- regardless of whether
// it ever exercises NET_NEW_AI -- fail at module-parse time (confirmed
// live: finalize-pipeline-youtube-removal-and-calendar.test.ts, which has
// nothing to do with image generation, broke this way the moment this was
// a static import). A dynamic import is parsed only when this function
// actually runs, which happens only for a real NET_NEW_AI generation
// attempt -- identical real behavior in production (Next.js's real
// bundler/runtime handles dynamic import natively), zero behavior change,
// and it stops an unrelated module's local-test-tooling incompatibility
// from propagating into every caller's test suite.
async function loadImageGenerationService() {
  return import("../image-generation/service.ts");
}

/** Found live (Mission D+ real backfill run): a Server Action / route
 * killed mid-flight by its own real maxDuration budget (NET_NEW_AI's real
 * image-generation calls are ~150s+ each, so a batch of several can
 * genuinely exceed 300s) leaves that job's row stuck at PROCESSING
 * forever -- it was never marked FAILED, because nothing survived to run
 * the catch block. processImageGenerationJob's own PROCESSING branch
 * (correctly, for the case this module doesn't own -- a genuinely
 * concurrent in-flight call) just returns the row as-is rather than
 * re-driving it, and createImageGenerationJob's idempotency lookup ties
 * every future attempt for this SAME queue item to that SAME dead row
 * forever, regardless of status. Comfortably above the ~156s a real
 * generation has taken in production, so a genuinely in-flight concurrent
 * call is never mistaken for stale. */
const STALE_PROCESSING_MS = 10 * 60_000;

function isStaleInFlight(job: { status: string; updated_at: string }): boolean {
  if (!["PROCESSING", "REVIEWING", "REVISING"].includes(job.status)) return false;
  return Date.now() - new Date(job.updated_at).getTime() > STALE_PROCESSING_MS;
}

/**
 * Mission D+ Sections 16-19: the NET_NEW_AI creative mode. Before this,
 * `prepareNearTermPackageItems` had exactly one media path --
 * `selectPackageMediaAsset`, which only ever picks from the tenant's
 * EXISTING `social_media_assets` (see package-media.ts's own header: "There
 * is deliberately no text fallback... variety is a preference, never a
 * reason to block a post"). That's the right default (BRAND_LIBRARY), but
 * there was no way to require a genuinely NEW image for a unit, and no code
 * path anywhere in the automatic pipeline ever called the real
 * image-generation service at all.
 *
 * This reuses the EXACT same real chain the admin "force regenerate"
 * override already exercises in production
 * (app/admin/(shell)/social/actions.ts forceRegeneratePackageItemImageAction)
 * -- createImageGenerationJob -> processImageGenerationJob ->
 * selectImageGenerationCandidate against the real image-generation
 * provider. No parallel generation logic, no bypass of that pipeline's own
 * moderation/storage/tenant-scoping.
 *
 * Fail-closed (Section 18): any failure -- job error, zero usable
 * candidates -- throws. The caller (prepareNearTermPackageItems) already
 * treats a thrown preparation error as BLOCKED, never PREPARED, and never
 * falls back to selectPackageMediaAsset for a NET_NEW_AI unit. An old
 * tenant image silently standing in for a required net-new generation is
 * exactly the failure mode this mission calls out by name as forbidden.
 */
export async function generateNetNewPackageMediaAsset(
  service: ServiceClient,
  input: {
    tenantId: string;
    ownerId: string;
    treatment: CreativeTreatment | null;
    /** Used only for the idempotency key and audit sourceId -- never persisted as a fallback identity. */
    queueItemId: string;
  }
): Promise<{ id: string }> {
  const { createImageGenerationJob, processImageGenerationJob, selectImageGenerationCandidate } =
    await loadImageGenerationService();

  const brief =
    (input.treatment?.hook && input.treatment.hook.trim()) ||
    (input.treatment?.concept && input.treatment.concept.trim()) ||
    "Brand social post creative, on-brand and platform-appropriate.";

  const baseInput = {
    tenantId: input.tenantId,
    actorUserId: input.ownerId,
    brief,
    // createImageGenerationJob accepts the treatment as a plain record (it
    // re-validates the shape itself via validateTreatmentForJob) -- same
    // cast the admin force-regen action's own reconstructed-from-JSON
    // treatment implicitly satisfies.
    treatment: input.treatment as unknown as Record<string, unknown> | null,
    aspectRatio: "1:1" as const,
    candidateCount: 2,
    sourceContext: "social_autopilot" as const,
    sourceId: input.queueItemId,
    intendedUse: "social_post" as const,
  };

  let job = await createImageGenerationJob({
    authorizationClient: service,
    writeClient: service,
    input: {
      ...baseInput,
      // Stable per queue item, so a worker retry within the same
      // preparation window reuses the same job/candidates instead of
      // spending a second real generation call (Section 31: generation
      // retries must not double-attach).
      idempotencyKey: `package-net-new:${input.queueItemId}`,
    },
  });

  if (isStaleInFlight(job)) {
    // The stable key is permanently wedded to a dead job -- fall back to a
    // fresh, timestamped key (same disambiguation the admin force-regen
    // action already uses) so this attempt actually drives a new real
    // generation instead of re-fetching the same stuck PROCESSING row
    // forever.
    job = await createImageGenerationJob({
      authorizationClient: service,
      writeClient: service,
      input: {
        ...baseInput,
        idempotencyKey: `package-net-new-retry:${input.queueItemId}:${Date.now()}`,
      },
    });
  }

  const processed = await processImageGenerationJob({ writeClient: service, jobId: job.id });
  if (processed.job.status !== "READY" || !processed.candidates.length) {
    throw new Error(
      `net_new_generation_failed: ${processed.job.safe_error ?? processed.job.error_code ?? "no candidates returned"}`
    );
  }

  const best = processed.candidates.find((c) => c.status !== "REJECTED") ?? processed.candidates[0];
  if (!best) {
    throw new Error("net_new_generation_failed: all candidates rejected");
  }

  // attachToVariantId is intentionally omitted -- the queue item's variant
  // doesn't exist yet at this point in prepareNearTermPackageItems (it's
  // created immediately after this call returns); the caller links this
  // asset the same way selectPackageMediaAsset's result is linked today
  // (a plain social_content_variant_media insert). selectImageGenerationCandidate
  // returns the job detail, not the asset -- the real id is on the
  // candidate we already picked.
  await selectImageGenerationCandidate({
    writeClient: service,
    tenantId: input.tenantId,
    jobId: job.id,
    candidateId: best.id,
    actorUserId: input.ownerId,
  });

  return { id: best.asset_id };
}
