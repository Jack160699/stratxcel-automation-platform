// Run with: node --experimental-strip-types lib/social/__tests__/studio-creative-treatment.test.ts
//
// studio-creative-treatment.ts has no dependency-injection seam for its AI
// provider (resolveConfiguredProvider() is called directly, not passed in)
// and calls real Supabase queries once a provider IS configured -- there is
// no existing mock.module precedent in this codebase (checked: only
// mock.method, used for console spies, appears anywhere in this repo's
// tests) and introducing one here would be a novel, more fragile pattern
// for a single file. This suite covers what's honestly testable without
// live AI/DB credentials:
//   1. The real, load-bearing "never blocks a manual/Studio generation"
//      contract -- resolveConfiguredProvider() genuinely returns null in
//      this bare test-runner environment (neither GEMINI_API_KEY nor
//      OPENAI_API_KEY is set), so both exported functions must return null
//      WITHOUT ever touching the passed-in writeClient. This is real,
//      executed behavior, not a stub -- if a future change moved the
//      provider check after a DB call, this test would throw against the
//      deliberately-broken fake client below.
//   2. Static source-inclusion checks (mirroring lib/image-generation/
//      __tests__/image-generation.test.ts's own established pattern for a
//      file it can't safely execute end-to-end) confirming Studio actually
//      uses the SAME canonical retry-and-synthesize treatment logic as the
//      automated pipeline, not a parallel, drifting implementation.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateStudioCreativeTreatment, generateManualArchetypeCreativeTreatment } from "../studio-creative-treatment.ts";

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`studio-creative-treatment.test.ts: ${name} — PASS`))
    .catch((err) => {
      console.error(`studio-creative-treatment.test.ts: ${name} — FAIL`);
      throw err;
    });
}

/** A writeClient that throws the instant anything touches it -- proves the
 * provider-configured check genuinely short-circuits BEFORE any DB access,
 * not just "usually" or "in the happy path". */
const POISONED_CLIENT = new Proxy(
  {},
  {
    get() {
      throw new Error("studio-creative-treatment.ts touched the Supabase client before checking for a configured AI provider");
    },
  },
) as unknown as import("@supabase/supabase-js").SupabaseClient;

async function run() {
  assert.equal(process.env.GEMINI_API_KEY, undefined, "this test requires a bare environment with no GEMINI_API_KEY -- unset it to run this suite");
  assert.equal(process.env.OPENAI_API_KEY, undefined, "this test requires a bare environment with no OPENAI_API_KEY -- unset it to run this suite");

  await test("generateStudioCreativeTreatment never blocks and never touches the DB when no AI provider is configured", async () => {
    const result = await generateStudioCreativeTreatment({
      writeClient: POISONED_CLIENT,
      tenantId: "tenant-a",
      brief: "Announce our new weekend seafood thali offer",
      intendedUse: "social_post",
    });
    assert.equal(result, null);
  });

  await test("generateManualArchetypeCreativeTreatment never blocks and never touches the DB when no AI provider is configured", async () => {
    const result = await generateManualArchetypeCreativeTreatment({
      writeClient: POISONED_CLIENT,
      tenantId: "tenant-a",
      brief: "A structured feature/benefit post about our AI content engine",
      forcedArchetype: "FEATURE_POSTER",
    });
    assert.equal(result, null);
  });

  await test("generateStudioCreativeTreatment never throws even with a malformed/empty brief", async () => {
    const result = await generateStudioCreativeTreatment({
      writeClient: POISONED_CLIENT,
      tenantId: "tenant-a",
      brief: "",
      intendedUse: "unknown_intended_use",
    });
    assert.equal(result, null);
  });

  const source = readFileSync(resolve(import.meta.dirname, "..", "studio-creative-treatment.ts"), "utf8");

  await test("Studio uses the SAME canonical runCreativeTreatmentAttempts retry-and-synthesize logic the automated pipeline uses, not a parallel single-shot implementation", () => {
    assert.ok(source.includes("runCreativeTreatmentAttempts"), "expected Studio to call the shared canonical treatment-generation helper");
    assert.ok(!source.includes("validateCreativeTreatment("), "Studio should no longer call validateCreativeTreatment directly -- that's now runCreativeTreatmentAttempts's job, so both pipelines share one implementation");
  });

  await test("Studio passes creativeFormat and recentCompositions into the shared treatment call, same as the automated pipeline", () => {
    assert.ok(source.includes("creativeFormat: manualBrief.creativeFormat"), "expected Studio to thread the brief's creativeFormat into the treatment call");
    assert.ok(source.includes("recentCompositions"), "expected Studio to keep passing its own real recentCompositions history into the treatment call");
  });

  await test("Studio's provider-agnostic callModel wrapper reuses its own existing provider.complete convention -- no new hard-coded vendor dependency introduced by this wiring", () => {
    assert.ok(source.includes("provider.complete("), "expected Studio's callModel wrapper to still go through its own configured provider, not a new direct fetch");
  });

  console.log("studio-creative-treatment.test.ts: ALL PASS");
}

await run();
