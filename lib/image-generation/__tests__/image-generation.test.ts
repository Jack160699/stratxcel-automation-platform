import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AIProviderError, ImageMediaRuntime, InMemoryCanonicalMediaStorage } from "@stratxcel/ai-runtime";
import { buildProviderReadyImagePrompt, createAdvisoryImageCritique, snapshotImageBrandContext } from "../prompt.ts";

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
  const socialTool = read("lib", "social", "agent", "generate-image-tool.ts");
  assert.ok(socialTool.includes('existing?.status === "FAILED"'));
  assert.ok(socialTool.includes("outcomeUnknown"));
  const workforce = read("packages", "workforce-core", "src", "providers", "image-generation.ts");
  assert.ok(workforce.includes("generationJobId"));
  assert.ok(workforce.includes("mediaAssetId"));
  assert.ok(workforce.includes("usageAccountingStatus"));
  assert.ok(workforce.includes("MISSION_ARTIFACT_FAILED"));

  console.log("image-generation.test.ts: ALL PASS");
}

await run();
