// FINAL STRATXCEL -- REMOVE LOCAL AI FROM IMAGE GENERATION (2026-09-06).
//
// packages/ai-runtime/src/__tests__/image-local-ai-provider.test.ts proves
// ImageMediaRuntime.generate() itself never touches Local AI. This file
// proves the surrounding piece: every REAL customer-facing image route in
// this app funnels through that one runtime and nothing else -- so there is
// no second, uninspected path (a route that builds its own client, an agent
// tool that calls LocalAIImageProvider directly) that could still reach it.
// Source-level assertions, not mocked HTTP: this catches a future edit that
// re-introduces a local branch or a stray direct import just as reliably as
// a live call would, without needing real provider credentials.
// Run with: node --experimental-strip-types lib/image-generation/__tests__/no-local-ai-image-routing.test.ts

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

function read(relPath: string): string {
  return readFileSync(resolve(import.meta.dirname, "../../..", relPath), "utf8");
}

function walk(dir: string, out: string[] = []): string[] {
  const absDir = resolve(import.meta.dirname, "../../..", dir);
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      walk(rel, out);
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      out.push(rel);
    }
  }
  return out;
}

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`no-local-ai-image-routing.test.ts: ${name} — PASS`);
  } catch (err) {
    console.error(`no-local-ai-image-routing.test.ts: ${name} — FAIL`);
    throw err;
  }
}

function main() {
  test("the real ImageMediaRuntime.generate() boundary imports no Local AI provider at all", () => {
    const src = read("packages/ai-runtime/src/media/image.ts");
    // Explanatory comments in this file legitimately name LocalAIImageProvider
    // (documenting why it's gone) -- what must never exist is an import of
    // it, a call through it, or a candidate claiming to be from it.
    assert.ok(!/^\s*import\s+.*LocalAIImageProvider/m.test(src), "media/image.ts must not import LocalAIImageProvider");
    assert.ok(!src.includes("isLocalAiRoutingEnabled"), "media/image.ts must not gate anything on the shared LOCAL_AI_ENABLED flag -- image routing has no flag at all");
    assert.ok(!src.includes('provider: "local"'), 'no code path in media/image.ts may construct a candidate/outcome claiming provider "local"');
    assert.ok(!/localImageProvider\??:/.test(src), "ImageMediaDeps must not accept a local-image injection seam");
  });

  test("ImageCandidateResult and ImageGenerationOutcome are typed to exclude \"local\" as a provider value", () => {
    const src = read("packages/ai-runtime/src/media/image.ts");
    assert.ok(!/provider:\s*"google"\s*\|\s*"openai"\s*\|\s*"local"/.test(src), "no provider union in this file may include \"local\"");
  });

  test("every real customer-facing image-generation route (create, manual, AND regenerate/edit) funnels through the shared service, not a bespoke client", () => {
    for (const routeFile of [
      "app/api/platform/image-generations/route.ts",
      "app/api/platform/social/autopilot/manual-generate/route.ts",
      "app/api/platform/image-generations/[jobId]/revise/route.ts",
    ]) {
      const src = read(routeFile);
      assert.ok(
        src.includes("createImageGenerationJob") || src.includes("createTenantMediaRuntime") || src.includes("processImageGenerationJob"),
        `${routeFile} must call the shared image-generation service, not build its own provider client`,
      );
      assert.ok(!src.includes("LocalAIImageProvider"), `${routeFile} must never import LocalAIImageProvider directly`);
      assert.ok(!/from ["']@stratxcel\/ai-runtime\/media\/local-image/.test(src), `${routeFile} must never import the local-image module directly`);
    }
  });

  test("createTenantMediaRuntime (the real production factory) constructs ImageMediaRuntime with no local-image override", () => {
    const src = read("packages/ai-runtime/src/factory.ts");
    const imagesBlock = src.slice(src.indexOf("const images = new ImageMediaRuntime("), src.indexOf("const images = new ImageMediaRuntime(") + 400);
    assert.ok(!imagesBlock.includes("localImageProvider"), "the production factory must not wire a local image provider into ImageMediaRuntime");
  });

  test("no file under app/api/platform (every real customer-facing API route) references LocalAIImageProvider", () => {
    const offenders: string[] = [];
    for (const file of walk("app/api/platform")) {
      const src = read(file);
      if (src.includes("LocalAIImageProvider")) offenders.push(file);
    }
    assert.deepEqual(offenders, [], `these customer-facing routes reference LocalAIImageProvider directly, which must never happen: ${offenders.join(", ")}`);
  });

  test("the internal diagnostics route (the one legitimate LocalAIImageProvider caller) is secret-gated and outside app/api/platform", () => {
    const diagnosticsPath = "app/api/internal/ai/diagnostics/route.ts";
    const src = read(diagnosticsPath);
    assert.ok(src.includes("LocalAIImageProvider"), "sanity check: the diagnostics route is expected to still probe the local server's own image capability directly");
    assert.ok(src.includes("AI_DIAGNOSTICS_SECRET"), "the one file allowed to call LocalAIImageProvider directly must be secret-gated, never reachable by a customer request");
    assert.ok(!diagnosticsPath.startsWith("app/api/platform/"), "the diagnostics probe must live outside the customer-facing app/api/platform tree");
  });

  test("Local AI chat/coding/website fallback routing is untouched -- task-policies.ts still gates CONTENT/SALES_CONVERSION/WEBSITE_ENGINEERING on LOCAL_AI_ENABLED", () => {
    const src = read("packages/ai-runtime/src/policy/task-policies.ts");
    assert.ok(src.includes('provider: "local", model: localChat, role: "primary"'), "CONTENT must still be able to route to local chat when enabled");
    assert.ok(src.includes('provider: "local", model: localCoding, role: "escalation"'), "WEBSITE_ENGINEERING must still be able to escalate to local coding when enabled");
    assert.ok(!/IMAGE.*localImage|local.*IMAGE.*model/is.test(src.slice(src.indexOf('IMAGE: policy'), src.indexOf('IMAGE: policy') + 400)), "the IMAGE task policy itself must never list a local candidate");
  });

  console.log("no-local-ai-image-routing.test.ts: ALL PASS");
}

main();
