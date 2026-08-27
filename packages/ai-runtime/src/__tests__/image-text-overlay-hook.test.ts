/**
 * Real integration point for Premium Creative Intelligence Section 9:
 * headline/CTA/brand text must be rendered deterministically, never left
 * to the image model. This is the hook (ImageGenerateRequest.
 * textOverlayCompositor) that makes that possible without ai-runtime
 * taking a hard dependency on a compositing implementation (sharp) or on
 * lib/social's types -- callers inject their own compositor.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ImageMediaRuntime } from "../index.ts";
import { InMemoryCanonicalMediaStorage } from "../media/canonical-storage.ts";

function fakeGeminiImageResponse(base64: string) {
  return async () => Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: base64 } }] } }] });
}

describe("ImageGenerateRequest.textOverlayCompositor", () => {
  it("persists the compositor's output bytes, not the provider's raw bytes", async () => {
    const storage = new InMemoryCanonicalMediaStorage();
    storage.authorizeTenant("tenant-a");
    const runtime = new ImageMediaRuntime({
      geminiApiKey: "test",
      fetchImpl: fakeGeminiImageResponse(Buffer.from([1, 2, 3]).toString("base64")),
      storage,
    });

    const result = await runtime.generate({
      tenantId: "tenant-a",
      prompt: "brief",
      persistCanonical: true,
      textOverlayCompositor: async ({ bytes, mimeType }) => {
        // Detectable transform: prepend a marker byte.
        return { bytes: new Uint8Array([255, ...bytes]), mimeType };
      },
    });

    assert.equal(result.outcome, "OK");
    assert.equal(result.candidates.length, 1);
    const assetId = result.candidates[0]!.storedAsset!.assetId;
    const stored = storage.assets.get(assetId)!;
    assert.deepEqual([...stored.bytes], [255, 1, 2, 3], "expected the composited bytes (with the marker) to be what's persisted");
  });

  it("falls back to the uncomposited original when the compositor throws, never losing the generation", async () => {
    const storage = new InMemoryCanonicalMediaStorage();
    storage.authorizeTenant("tenant-a");
    const runtime = new ImageMediaRuntime({
      geminiApiKey: "test",
      fetchImpl: fakeGeminiImageResponse(Buffer.from([9, 9, 9]).toString("base64")),
      storage,
    });

    const result = await runtime.generate({
      tenantId: "tenant-a",
      prompt: "brief",
      persistCanonical: true,
      textOverlayCompositor: async () => {
        throw new Error("compositor exploded");
      },
    });

    assert.equal(result.outcome, "OK", "a compositor failure must not fail the whole generation");
    assert.equal(result.candidates.length, 1);
    const assetId = result.candidates[0]!.storedAsset!.assetId;
    const stored = storage.assets.get(assetId)!;
    assert.deepEqual([...stored.bytes], [9, 9, 9], "expected the original uncomposited bytes as the safe fallback");
  });

  it("without a compositor supplied, behavior is unchanged (regression safety)", async () => {
    const storage = new InMemoryCanonicalMediaStorage();
    storage.authorizeTenant("tenant-a");
    const runtime = new ImageMediaRuntime({
      geminiApiKey: "test",
      fetchImpl: fakeGeminiImageResponse(Buffer.from([7, 7]).toString("base64")),
      storage,
    });

    const result = await runtime.generate({ tenantId: "tenant-a", prompt: "brief", persistCanonical: true });
    assert.equal(result.outcome, "OK");
    const assetId = result.candidates[0]!.storedAsset!.assetId;
    const stored = storage.assets.get(assetId)!;
    assert.deepEqual([...stored.bytes], [7, 7]);
  });
});
