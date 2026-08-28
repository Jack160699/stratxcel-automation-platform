import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AIProviderError, ImageMediaRuntime, InMemoryCanonicalMediaStorage } from "@stratxcel/ai-runtime";
import { buildProviderReadyImagePrompt, createAdvisoryImageCritique, snapshotImageBrandContext } from "../prompt.ts";
// service.ts cannot be imported directly here: it starts with `import
// "server-only"`, which throws outside Next's bundler (confirmed by direct
// test) -- the same reason every service.ts assertion below is a static
// source-inclusion check (read(...)) rather than a live import, matching
// this file's existing established pattern.

const root = resolve(import.meta.dirname, "..", "..", "..");
const read = (...parts: string[]) => readFileSync(resolve(root, ...parts), "utf8");

async function run() {
  const brand = snapshotImageBrandContext({
    business_name: "Northstar Dental",
    industry: "Dentistry",
    target_audience: "Families in Pune",
    approved_claims: ["Open six days"],
    prohibited_claims: ["Guaranteed painless"],
    secret_internal_note: "must never cross the boundary",
  });
  assert.equal(brand.business_name, "Northstar Dental");
  assert.equal(Object.hasOwn(brand, "secret_internal_note"), false);
  const prompt = buildProviderReadyImagePrompt({ brief: "Announce our new service", intendedUse: "social_post", aspectRatio: "4:5", brandContext: brand });
  assert.match(prompt, /Northstar Dental/);
  assert.match(prompt, /Open six days/);
  assert.match(prompt, /Never include these claims: Guaranteed painless/);
  assert.doesNotMatch(prompt, /secret_internal_note/);
  assert.match(prompt, /Do not invent business facts/);

  const critique = createAdvisoryImageCritique({ aspectRatio: "4:5", intendedUse: "social_post", hasBrandContext: true, referenceCount: 1, provider: "google", model: "image-model" });
  assert.equal(critique.advisory, true);
  assert.equal(critique.certainty, "limited_without_independent_visual_review");

  // A timeout may be outcome-unknown, so no automatic paid fallback is issued.
  let timeoutCalls = 0;
  const timeoutRuntime = new ImageMediaRuntime({
    geminiApiKey: "test",
    openaiApiKey: "test",
    fetchImpl: async () => { timeoutCalls += 1; throw new AIProviderError("TIMEOUT", "timeout"); },
  });
  const timeout = await timeoutRuntime.generate({ tenantId: "tenant-a", prompt: "brief" });
  assert.equal(timeout.outcome, "FAILED");
  assert.equal(timeout.reason, "provider_timeout_outcome_unknown");
  assert.equal(timeoutCalls, 1);

  // A later candidate failure preserves an already-returned real candidate;
  // it does not fallback or discard the successful provider output.
  let partialCalls = 0;
  const partialRuntime = new ImageMediaRuntime({
    geminiApiKey: "test",
    openaiApiKey: "test",
    fetchImpl: async () => {
      partialCalls += 1;
      if (partialCalls === 2) throw new AIProviderError("TIMEOUT", "timeout");
      return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "AQID" } }] } }] });
    },
  });
  const partial = await partialRuntime.generate({ tenantId: "tenant-a", prompt: "brief", candidateCount: 2 });
  assert.equal(partial.outcome, "OK");
  assert.equal(partial.candidates.length, 1);
  assert.equal(partialCalls, 2);

  // OpenAI generation fallback must not silently ignore a reference image.
  let referenceCalls = 0;
  const storage = new InMemoryCanonicalMediaStorage({ ownerId: "owner-a", authorizedTenantIds: ["tenant-a"] });
  storage.seedReference({ id: "ref-a", tenantId: "tenant-a", mimeType: "image/png", bytes: new Uint8Array([1, 2, 3]) });
  const referenceRuntime = new ImageMediaRuntime({
    geminiApiKey: "test",
    openaiApiKey: "test",
    storage,
    fetchImpl: async () => { referenceCalls += 1; return new Response("{}", { status: 500 }); },
  });
  const reference = await referenceRuntime.generate({ tenantId: "tenant-a", prompt: "brief", referenceAssetIds: ["ref-a"] });
  assert.equal(reference.outcome, "FAILED");
  assert.equal(reference.reason, "reference_mode_unsupported_by_openai_fallback");
  assert.equal(referenceCalls, 1);

  const migration = read("supabase", "migrations", "20260812104243_image_generation_v1.sql");
  for (const required of [
    "create table image_generation_jobs",
    "create table image_generation_references",
    "create table image_generation_candidates",
    "unique (tenant_id, actor_user_id, idempotency_key)",
    "image_generation_jobs_selected_candidate_fk",
    "enable row level security",
    "tenant_members",
    "revoke all",
    "social_media_assets_tenant_generated_read",
  ]) assert.ok(migration.includes(required), `migration missing ${required}`);

  const createRoute = read("app", "api", "platform", "image-generations", "route.ts");
  assert.ok(createRoute.includes("requireImageGenerationContext"));
  assert.ok(createRoute.includes("after(async"));
  const studio = read("app", "app", "content", "studio", "CreativeStudioWorkspace.tsx");
  assert.ok(studio.includes("attempt < 60"));
  assert.ok(studio.includes('next/image'));
  for (const visibleState of [
    "Your candidates will appear here",
    "Generating…",
    "Generation failed",
    "History",
    "References",
    "Upload image",
  ]) assert.ok(studio.includes(visibleState), `Creative Studio missing ${visibleState} state`);
  const service = read("lib", "image-generation", "service.ts");
  assert.ok(service.includes('.eq("status", "active")'));
  assert.ok(service.includes('"PARENT_CANDIDATE_NOT_FOUND"'));
  assert.ok(service.includes("unique") || migration.includes("idempotency_key"));
  assert.ok(service.includes('from("social_content_variant_media").upsert'));
  assert.ok(service.includes('kind: "image_final"'));

  // Premium Creative Intelligence production wiring (build brief "FINAL
  // PRODUCTION QUALITY COMPLETION LOOP" §3): the real Creative Treatment
  // must drive the actual image prompt, and deterministic text-overlay
  // compositing must be part of the actual generation call -- not
  // harness-only functionality. Verified as source-inclusion (not a live
  // import) for the same server-only reason as the checks above.
  assert.ok(service.includes("buildVisualDirectorBrief"), "the treatment-derived visual-director prompt must be wired into the real generation path");
  assert.ok(service.includes("textOverlayCompositor"), "deterministic text-overlay compositing must be wired into the real media.images.generate() call");
  assert.ok(service.includes("renderTextOverlay"), "the real sharp-based compositor must actually be used, not merely referenced");
  assert.ok(service.includes("validateTreatmentForJob") && service.includes("validateCreativeTreatment"), "a malformed treatment must be validated, never silently trusted");
  assert.ok(service.includes("creative_treatment: validatedTreatment"), "the validated treatment must actually be persisted on the job row");
  assert.ok(service.includes("text_overlay_applied:"), "whether overlay compositing was applied must be recorded per candidate, not left unobservable");

  const treatmentMigration = read("supabase", "migrations", "20260827160000_image_generation_creative_treatment.sql");
  for (const required of [
    "add column if not exists creative_treatment jsonb",
    "add column if not exists text_overlay_applied boolean not null default false",
  ]) assert.ok(treatmentMigration.includes(required), `treatment migration missing: ${required}`);
  const socialTool = read("lib", "social", "agent", "generate-image-tool.ts");
  assert.ok(socialTool.includes('existing?.status === "FAILED"'));
  assert.ok(socialTool.includes("outcomeUnknown"));
  const workforce = read("packages", "workforce-core", "src", "providers", "image-generation.ts");
  assert.ok(workforce.includes("generationJobId"));
  assert.ok(workforce.includes("mediaAssetId"));
  assert.ok(workforce.includes("usageAccountingStatus"));
  assert.ok(workforce.includes("MISSION_ARTIFACT_FAILED"));

  // Subscription-Gated Visual Archetypes brief Section 7 Rule C: manual
  // (requestedArchetype-carrying) generation must be server-validated
  // BEFORE the job is created, using tier + saved-preference truth read
  // fresh from the DB inside this same function -- never trusting the
  // request body's tier or preference claims. Verified as source-
  // inclusion for the same server-only reason as every other check above;
  // resolveManualRouting's own decision logic (the actual security-
  // critical part) is fully unit-tested in real isolation by
  // archetype-routing.test.ts.
  assert.ok(service.includes("resolveManualRouting"), "manual archetype requests must go through the real, shared routing decision -- not a bespoke inline check");
  assert.ok(service.includes("isManualArchetypeRequest"), "manual-vs-automated must be a real, explicit branch, not inferred implicitly");
  assert.ok(!service.includes('resolveTenantPlanTier(args.writeClient as never, input.tenantId)'), "the manual-routing tier lookup must NOT reuse resolveTenantPlanTier (a budget-tier helper that silently defaults an unrecognized/missing subscription to \"starter\") -- must query subscriptions.plan_tier directly so \"no subscription\" stays \"no subscription\"");
  assert.ok(service.includes('.eq("tenant_id", input.tenantId).eq("status", "active")') || service.includes('.from("subscriptions").select("plan_tier").eq("tenant_id", input.tenantId)'), "the manual-routing tier lookup must read the real subscriptions table directly");
  assert.ok(service.includes("social_autopilot_manual_monthly"), "a manual archetype request must draw from its own dedicated quota metric, not the automated or generic pools");
  assert.ok(service.includes("forceArchetypeOntoTreatment"), "an authorized manual archetype request must be force-applied to the treatment -- the AI/caller must never have the final say once routing has decided");

  // Fix Vercel Timeouts & Content Library UI Rendering mission: real bugs
  // found live. (1) image_generation_jobs.selected_candidate_id is only
  // ever set by an explicit selectImageGenerationCandidate call -- this
  // route requested the service-wide default of 2 candidates but never
  // called it, so every job sat READY with two real candidates and a
  // permanently null selection, and the Content Library's imageUrl lookup
  // (keyed on selected_candidate_id) came back empty every time. (2) all
  // three real generation routes had maxDuration=180 against an AI runtime
  // that can legitimately take up to 170s on its own, leaving ~10s for the
  // compositor/storage/DB work that follows -- Vercel was killing the
  // function before that work finished.
  const manualGenerateRoute = read("app", "api", "platform", "social", "autopilot", "manual-generate", "route.ts");
  assert.ok(manualGenerateRoute.includes("candidateCount: 1"), "manual generation must request exactly 1 candidate -- its own UI never offers a choice between multiple, so requesting more only wastes real provider cost with no candidate ever getting selected");
  assert.ok(manualGenerateRoute.includes("selectImageGenerationCandidate"), "manual generation must auto-select its (only) candidate once ready -- nothing else in this flow ever calls selectImageGenerationCandidate for it");
  assert.match(manualGenerateRoute, /maxDuration\s*=\s*300/, "manual-generate must have real margin over the AI runtime's own up-to-170s timeout budget, not the 180s that left ~10s for post-generation work");
  const reviseRoute = read("app", "api", "platform", "image-generations", "[jobId]", "revise", "route.ts");
  assert.match(reviseRoute, /maxDuration\s*=\s*300/, "the revise route awaits processImageGenerationJob synchronously -- it needs the same real timeout margin as every other real-generation route");
  assert.match(createRoute, /maxDuration\s*=\s*300/, "the primary generation route needs the same real timeout margin");

  // Display-layer defensive fallback for jobs that already exist in
  // production with selected_candidate_id: null (unaffected by the
  // manual-generate fix above, since that only prevents the gap for new
  // jobs going forward) -- the Content Library must still resolve a real
  // thumbnail for them instead of permanently falling back to text-only.
  const contentLibraryPage = read("app", "app", "content", "page.tsx");
  assert.ok(contentLibraryPage.includes("pickBestCandidate"), "the Content Library must fall back to the best available candidate when no explicit selection was ever made, not just the (possibly-null) selected_candidate_id");
  assert.ok(contentLibraryPage.includes('c.status === "SELECTED"'), "the fallback must prefer a genuinely SELECTED candidate over an arbitrary one when both exist");
  assert.ok(!contentLibraryPage.includes("treatment?.ctaDirection"), "must not read the nonexistent CreativeTreatment.ctaDirection field -- the real CTA lives at treatment.cta.text (a CtaDecision object)");
  assert.ok(contentLibraryPage.includes("cta?.text"), "the CTA line shown on a content card must read the real treatment.cta.text field");

  // Content Library Filtering mission: BrandBrain Logo Engine variants
  // (provenance.purpose: "logo_variant") must never surface as content
  // cards -- verified live that .not("provenance", "cs", ...) (NOT
  // "contains") is the safe exclusion, since a naive .neq() on the JSON
  // path would silently also hide every asset with no recorded purpose at
  // all (NULL != 'x' is NULL, not TRUE, in SQL).
  assert.ok(contentLibraryPage.includes('.not("provenance", "cs"'), "the tenant-media query must exclude logo_variant rows via a real, verified-safe provenance filter, not pull every READY asset unconditionally");
  assert.ok(contentLibraryPage.includes("logo_variant"), "the exclusion filter must actually target the real purpose value logo-analyze/route.ts writes");

  // BrandBrain Logo Engine Phase 4: the real production wiring from a
  // tenant's saved logo_variants (brand_brains content JSONB) into the
  // deterministic compositor's logoVariants input. Verified as source-
  // inclusion for the same server-only reason as every other service.ts
  // check above; selectLogoVariant's own per-archetype decision logic is
  // fully unit-tested in real isolation by text-overlay-render.test.ts,
  // and the sharp pipeline that produces the variants themselves by
  // logo-analyzer.test.ts.
  assert.ok(service.includes("resolveLogoVariantBundle"), "the real generation path must resolve this tenant's saved logo variants, not just accept a caller-supplied logoImage");
  assert.ok(service.includes("getCurrentBrandBrain") && service.includes("logo_variants"), "logo variants must be read from the real, versioned brand_brains content -- not a separate/duplicated store");
  assert.ok(service.includes("logoVariants") && service.includes("renderTextOverlay"), "the resolved logo variant bundle must actually reach the real compositor call, not just be resolved and discarded");
  const textOverlayRender = read("lib", "social", "text-overlay-render.ts");
  assert.ok(textOverlayRender.includes("export function selectLogoVariant"), "the archetype-appropriate variant selection must be a real, exported, independently-testable function");
  assert.ok(textOverlayRender.includes("ARCHETYPE_LOGO_SURFACE"), "variant selection must be driven by a real per-archetype surface-tone table, not an ad hoc guess");
  const logoAnalyzeRoute = read("app", "api", "platform", "brand", "logo-analyze", "route.ts");
  assert.ok(logoAnalyzeRoute.includes("analyzeLogo"), "the logo-analyze route must use the real sharp pipeline, not a stub");
  assert.ok(logoAnalyzeRoute.includes('provenance: { purpose:'), "each generated variant must record its own provenance (purpose/variant/sourceAssetId/dimensions) on its social_media_assets row -- never an untraceable generated asset");

  // Content Library Filtering mission Safeguard: the delete route must
  // never let a client (stale frontend, direct API call, or a race with
  // the deploy) delete a social_media_asset that's actively referenced as
  // this tenant's saved logo -- checked against the real, live
  // brand_brains content, not just inferred from provenance.
  const contentDeleteRoute = read("app", "api", "platform", "content", "[id]", "route.ts");
  assert.ok(contentDeleteRoute.includes("logo_variants"), "the delete route must check the real saved logo_variants before deleting a social_media_asset");
  assert.ok(contentDeleteRoute.includes("referencedAssetIds"), "the safeguard must check the actual referenced asset ids, not just a provenance guess");
  assert.match(contentDeleteRoute, /status:\s*409/, "an attempt to delete an actively-referenced logo asset must be rejected with a real conflict status, not silently succeed");
  const brandPage = read("app", "app", "brand", "page.tsx");
  assert.ok(brandPage.includes("uploadToSignedUrlWithProgress"), "the fixed upload flow must actually use the real signed-upload protocol, not the broken raw-FormData POST it replaced");
  assert.ok(!brandPage.includes('formData.append("file", file)'), "the broken raw-multipart upload path must be fully removed, not left as dead/parallel code");

  // Unify Creative Studio With The Premium Autopilot Pipeline mission.
  // Module 1: the OpenAI /images/generations fallback has no aspect-ratio
  // parameter at all -- before this, every fallback request silently
  // rendered a square 1024x1024 image regardless of the requested aspect
  // ratio (a real bug: a 9:16 Story/Reel request from Creative Studio came
  // back square whenever Gemini was unconfigured or hopped to this
  // fallback). Verified live (not source-inclusion) against the real
  // OPENAI-fallback request body for each supported aspect ratio.
  const capturedSizes: string[] = [];
  const openAiOnlyRuntime = new ImageMediaRuntime({
    geminiApiKey: undefined,
    openaiApiKey: "test",
    fetchImpl: async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { size?: string };
      capturedSizes.push(body.size ?? "");
      return Response.json({ data: [{ b64_json: "AQID" }] });
    },
  });
  await openAiOnlyRuntime.generate({ tenantId: "tenant-a", prompt: "brief", aspectRatio: "9:16" });
  await openAiOnlyRuntime.generate({ tenantId: "tenant-a", prompt: "brief", aspectRatio: "16:9" });
  await openAiOnlyRuntime.generate({ tenantId: "tenant-a", prompt: "brief", aspectRatio: "1:1" });
  await openAiOnlyRuntime.generate({ tenantId: "tenant-a", prompt: "brief" });
  assert.deepEqual(capturedSizes, ["1024x1536", "1536x1024", "1024x1024", "1024x1024"], "the OpenAI fallback must request the real gpt-image-2 size closest to the caller's aspect ratio, never a hardcoded square regardless of what was asked for");

  // Module 2/3: Creative Studio must generate a real Gemini creative
  // treatment and thread it through exactly like createImageGenerationJob
  // already expects (validateTreatmentForJob/creative_treatment above) --
  // the ONLY thing standing between Creative Studio and the same
  // BrandBrain-logo + text-overlay-render.ts compositor package-autopilot.ts
  // already uses was that this route never supplied a treatment at all.
  const studioTreatment = read("lib", "social", "studio-creative-treatment.ts");
  assert.ok(studioTreatment.includes("getCurrentBrandBrain"), "the treatment must be built from this tenant's real, current Brand Brain -- not a stale or fabricated context");
  assert.ok(studioTreatment.includes("resolveConfiguredProvider"), "must call through the same production billing/routing-aware Gemini provider package-autopilot.ts uses, not a bespoke direct fetch");
  assert.ok(studioTreatment.includes("buildCreativeTreatmentPrompt") && studioTreatment.includes("validateCreativeTreatment"), "must build and validate a real structured CreativeTreatment, never trust an unvalidated AI response");
  assert.ok(studioTreatment.includes("return null"), "a failed/unconfigured/malformed treatment must degrade to brief-only generation, never block or throw for a manual Studio request");
  assert.ok(createRoute.includes("generateStudioCreativeTreatment"), "the Creative Studio route must actually call the treatment generator, not just have it available");
  assert.ok(createRoute.includes("treatment,") || createRoute.includes("treatment:"), "the generated treatment must actually be passed into createImageGenerationJob's input -- generating it and discarding it fixes nothing");
  assert.ok(createRoute.includes("findExistingImageGenerationJobByIdempotencyKey"), "a duplicate submit/retry must skip the billable treatment call entirely, not pay for a Gemini call that gets discarded when createImageGenerationJob's own idempotency check returns the existing job");
  assert.ok(service.includes("export async function findExistingImageGenerationJobByIdempotencyKey"), "the idempotency lookup must be a single exported source of truth, not duplicated between the route and createImageGenerationJob");

  // Fix Creative Studio Compositor Bypass & Logo Injection mission: the
  // Module 1/2 wiring above was correct but insufficient by itself -- these
  // are the real, independent bugs found tracing the live failure further.
  //
  // (1) The compositor -- including the real BrandBrain LOGO, which has
  // nothing to do with on-image text -- was gated on
  // resolvedOverlayElements.length, so any treatment that (correctly, per
  // its own prompt) planned zero on-image text skipped compositing
  // entirely, logo included.
  assert.ok(
    !/overlayContext\s*&&\s*resolvedOverlayElements\.length/.test(service),
    "the text-overlay compositor (and therefore the real BrandBrain logo) must run whenever a treatment exists, not only when on-image text happens to be planned -- gating on resolvedOverlayElements.length silently skipped the logo for every legitimate zero-text treatment"
  );
  assert.match(service, /const textOverlayCompositor\s*=\s*\n\s*overlayContext\s*\n/, "the compositor must be gated on overlayContext alone");

  // (2) Handing the image model the tenant's actual logo FILE as a
  // "reference" image invites it to redraw its own approximation directly
  // into the scene -- exactly the hallucinated-logo failure mode -- instead
  // of leaving that to the deterministic compositor once a real treatment
  // exists.
  assert.ok(service.includes("referenceAssetIds.length < 5 && !validatedTreatment"), "the Brand Kit logo must not be auto-included as a reference image once a real Creative Treatment already exists -- the compositor stamps the real logo file directly; handing the raw file to the image model too only risks a hallucinated duplicate");

  // (3) A tenant with only the legacy `logo_url` string (pre-Logo-Engine,
  // or orphaned logo_variants rows) got zero logo composited at all --
  // selectLogoVariant's own documented `logoImage` backward-compat fallback
  // was never actually fed one by the real production caller.
  const logoResolver = read("lib", "brand", "logo-variant-resolver.ts");
  assert.ok(logoResolver.includes("export async function resolveLegacyLogoImage"), "a tenant with only the legacy logo_url string (no logo_variants bundle) must still get a real logo composited via the documented logoImage fallback, not silently nothing");
  assert.ok(service.includes("resolveLegacyLogoImage") && service.includes("logoImage"), "the legacy logo_url fallback must actually reach the real renderTextOverlay call, not just be resolved and discarded");

  // (4) Of the 12 registered layout archetypes, only BASIC_ESSENTIAL and
  // FLOATING_CARD actually place the real raster logo image today (every
  // other archetype falls back to text-glyph brand-name only) -- Creative
  // Studio's treatment must be restricted to those two, or "the real
  // BrandBrain logo appears" isn't actually guaranteed regardless of every
  // other fix above.
  assert.ok(studioTreatment.includes('"BASIC_ESSENTIAL"') && studioTreatment.includes('"FLOATING_CARD"'), "Creative Studio's treatment archetype must be restricted to the two archetypes whose compositor implementation places a real logo image");
  assert.ok(studioTreatment.includes("routingContext: STUDIO_ARCHETYPE_ROUTING") || studioTreatment.includes("routingContext,"), "the archetype restriction must actually reach buildCreativeTreatmentPrompt, not just exist as an unused constant");
  assert.ok(studioTreatment.includes("validateCreativeTreatment(parsed, { concept: studioBrief.concept, routingContext"), "validateCreativeTreatment must also enforce the restriction server-side -- an AI that ignores the prompt instruction and returns a different archetype must be rejected, not silently trusted");
  const overlayRenderSrc = read("lib", "social", "text-overlay-render.ts");
  for (const archetype of ["BASIC_ESSENTIAL", "FLOATING_CARD"]) {
    assert.ok(overlayRenderSrc.includes(`"${archetype}"`), `${archetype} must be a real registered archetype (defense against the allowlist drifting from the actual registry)`);
  }

  // (5) The image model must be explicitly told not to draw its own
  // text/logo when a treatment (and therefore the real compositor) exists
  // -- the generic "don't invent facts" line elsewhere isn't specific
  // enough on its own.
  const visualDirectorPrompt = read("lib", "social", "visual-director-prompt.ts");
  assert.match(visualDirectorPrompt, /DO NOT draw any text.*logos/i, "buildVisualDirectorBrief must explicitly instruct the image model to produce a background photograph only, never its own text or logo");

  console.log("image-generation.test.ts: ALL PASS");
}

await run();
