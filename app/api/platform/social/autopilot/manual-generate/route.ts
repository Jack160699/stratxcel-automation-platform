import { after } from "next/server";
import { NextResponse } from "next/server";
import { requireImageGenerationContext } from "@/lib/image-generation/http";
import { createImageGenerationJob, ImageGenerationServiceError, processImageGenerationJob, selectImageGenerationCandidate } from "@/lib/image-generation/service";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { generateManualArchetypeCreativeTreatment } from "@/lib/social/studio-creative-treatment";
import { isValidArchetype, type LayoutArchetype } from "@/lib/social/archetype-registry";
import { randomUUID } from "node:crypto";

/**
 * The real, live entrypoint for Growth/Business manual/on-demand Social
 * Autopilot generation (Subscription-Gated Visual Archetypes brief
 * Section 3 Rule C): the ONLY caller anywhere in the codebase that sets
 * sourceContext: "social_autopilot" + requestedArchetype on a real
 * createImageGenerationJob call. Every tier/preference/archetype check
 * happens inside createImageGenerationJob itself (resolveManualRouting,
 * using a fresh DB read of this tenant's actual plan and saved
 * preferences) -- this route trusts nothing from the request body except
 * the brief text and the archetype the user clicked, both of which get
 * re-validated server-side regardless.
 */
export async function POST(request: Request) {
  const ctx = await requireImageGenerationContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const brief = typeof body.brief === "string" ? body.brief.trim() : "";
  const requestedArchetype = typeof body.requestedArchetype === "string" ? body.requestedArchetype : "";
  if (!brief) return NextResponse.json({ error: "Describe what this post should be about." }, { status: 400 });
  if (!requestedArchetype) return NextResponse.json({ error: "Choose a visual style." }, { status: 400 });

  try {
    // StratXcel Marketing Creative Engine mission (2026-09-06): real bug
    // found live -- this route passed requestedArchetype straight to
    // createImageGenerationJob without ever generating a `treatment`
    // (Premium Creative Intelligence's concept/hook/text-hierarchy/CTA
    // decision). createImageGenerationJob only builds an overlayContext
    // (and therefore only runs the real text-overlay-render.ts compositor)
    // when a validated treatment exists -- see this function's own
    // creative_treatment handling. Without one, every manual-generation
    // post persisted as a bare AI photo with no headline, CTA, logo, or
    // (FEATURE_POSTER's) differentiator list at all, regardless of which
    // visual style was picked. This is the exact same defect already found
    // and fixed once for Creative Studio (app/api/platform/image-
    // generations/route.ts) -- generateManualArchetypeCreativeTreatment
    // shares that same real Gemini-authored-treatment step, just forced
    // toward whatever archetype the tenant explicitly chose here rather
    // than Creative Studio's fixed logo-capable allowlist. Only attempted
    // for a real, registered archetype id; an invalid one is left to
    // createImageGenerationJob's own resolveManualRouting call to reject
    // with a structured error exactly as before.
    const treatment = isValidArchetype(requestedArchetype)
      ? await generateManualArchetypeCreativeTreatment({
          writeClient: ctx.service,
          tenantId: ctx.tenantId,
          brief,
          forcedArchetype: requestedArchetype as LayoutArchetype,
        })
      : null;

    // FINAL HERMES CREATIVE-DIVERSITY TEST mission (2026-09-06): real bug
    // found live -- generateCreativeTreatmentWithRouting's catch-all
    // (studio-creative-treatment.ts) deliberately returns null on ANY
    // internal failure (a rate-limited provider call, a parse failure) so
    // a transient AI hiccup never blocks a manual generation outright. But
    // this route treated that null exactly like "no archetype requested"
    // and quietly proceeded to createImageGenerationJob with
    // treatment: null anyway -- shipping a brandless, textless bare photo
    // as if it were a valid finished post, with no signal to the caller
    // that anything degraded. Confirmed live: a real FEATURE_POSTER
    // request landed READY with creative_treatment: null and
    // text_overlay_applied: false, rendering as a generic stock-style
    // photo with no headline, no CTA, and no logo at all. A tenant that
    // explicitly chose a visual style deserves a clear "try again" over a
    // silently degraded result -- so a validated archetype with a failed
    // treatment now fails loudly and retryably instead.
    if (isValidArchetype(requestedArchetype) && !treatment) {
      return NextResponse.json(
        { error: "Could not prepare a creative for this post right now. Please try again.", code: "TREATMENT_GENERATION_FAILED" },
        { status: 503 },
      );
    }

    const job = await createImageGenerationJob({
      authorizationClient: ctx.supabase,
      writeClient: ctx.service,
      input: {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        brief,
        idempotencyKey: randomUUID(),
        intendedUse: "social_post",
        aspectRatio: "1:1",
        // Real bug found live (Fix Vercel Timeouts & Content Library UI
        // Rendering mission): this route left candidateCount at its
        // service-wide default of 2, but ManualArchetypeGeneration's own UI
        // never offers a choice between candidates -- it shows exactly one
        // result. Every job it created sat READY with two real, generated,
        // never-selected candidates and image_generation_jobs.
        // selected_candidate_id permanently null, since nothing ever called
        // selectImageGenerationCandidate for it. The Content Library's
        // imageUrl lookup only resolves via selected_candidate_id, so every
        // one of these cards silently fell back to its text-only
        // presentation -- "rendering the raw text prompt instead of the
        // actual thumbnail." Requesting exactly 1 candidate here both fixes
        // that at the source (nothing left unselected) and halves real
        // provider cost/latency for a flow that only ever shows one result.
        candidateCount: 1,
        sourceContext: "social_autopilot",
        sourceId: null,
        requestedArchetype,
        // CreateImageJobInput.treatment is deliberately typed as an opaque
        // Record<string, unknown> -- createImageGenerationJob re-validates
        // it structurally itself (validateTreatmentForJob) and independently
        // re-authorizes + force-applies the tenant's real archetype
        // (resolveManualRouting + forceArchetypeOntoTreatment) rather than
        // trusting either this treatment's own layoutArchetype field or the
        // raw requestedArchetype string above.
        treatment: treatment as unknown as Record<string, unknown> | null,
      },
    });
    if (job.status === "QUEUED") {
      after(async () => {
        const service = createSupabaseServiceClient();
        try {
          const detail = await processImageGenerationJob({ writeClient: service, jobId: job.id });
          // Auto-select the (only) candidate so selected_candidate_id is
          // populated the moment the job is READY -- this flow has no
          // separate "review candidates and pick one" UI step, unlike
          // Creative Studio, so there is no other point at which this
          // would ever happen.
          const readyCandidate = detail.job.status === "READY" ? detail.candidates.find((c) => c.status !== "REJECTED") : null;
          if (readyCandidate) {
            await selectImageGenerationCandidate({
              writeClient: service,
              tenantId: ctx.tenantId,
              jobId: job.id,
              candidateId: readyCandidate.id,
              actorUserId: ctx.userId,
            }).catch((err) => {
              // A failure here leaves a real, viewable candidate un-selected
              // -- worse UX (falls back to text-only) but not a lost
              // generation, so it's logged and swallowed rather than
              // re-failing an otherwise-successful job.
              console.error("selectImageGenerationCandidate (social_autopilot manual auto-select): failed", {
                jobId: job.id,
                tenantId: ctx.tenantId,
                error: err instanceof Error ? err.message : String(err),
              });
            });
          }
        } catch (err) {
          console.error("processImageGenerationJob (social_autopilot manual): unhandled failure", {
            jobId: job.id,
            tenantId: ctx.tenantId,
            error: err instanceof Error ? err.message : String(err),
          });
          await service.from("image_generation_jobs").update({
            status: "FAILED",
            error_code: "INTERNAL_GENERATION_FAILURE",
            safe_error: "Image generation stopped unexpectedly.",
            error_retryable: true,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", job.id).eq("tenant_id", ctx.tenantId);
        }
      });
    }
    return NextResponse.json({ job }, { status: job.status === "QUEUED" ? 202 : 200 });
  } catch (error) {
    const known = error instanceof ImageGenerationServiceError ? error : null;
    return NextResponse.json({ error: known?.message ?? "Generation could not be started", code: known?.code }, { status: known?.status ?? 500 });
  }
}

export const runtime = "nodejs";
// See app/api/platform/image-generations/route.ts's comment: 180s left
// almost no margin over the AI runtime's own up-to-170s provider timeout
// budget once real compositor/storage/DB work after the provider call is
// counted. 300s matches this codebase's established budget for long AI
// chains.
export const maxDuration = 300;
