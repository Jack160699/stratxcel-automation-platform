// Run with: node --experimental-strip-types packages/ai-runtime/src/__tests__/canonical-storage-mime-probe.test.ts
//
// Regression test for a P1 finding from live E2E testing on 2026-08-23:
// every image generation request failed with STORAGE_UNAVAILABLE ("Generated
// media storage is not ready"), even though the social-agent-attachments
// bucket and the service-role credentials were completely fine.
//
// Root cause, confirmed by reproducing the exact upload directly against
// the real production bucket: isWritable()'s probe uploaded with
// contentType: "application/octet-stream", but the bucket has a deliberate
// MIME allowlist (text/plain, text/markdown, text/csv, application/json,
// application/pdf, image/*, video/mp4) that never included
// application/octet-stream. The real Storage API error --
// "mime type application/octet-stream is not supported" (HTTP 415) -- was
// silently swallowed by `if (error) return false`, so every downstream
// image generation job failed with a generic, misleading error pointing at
// storage/infra rather than the actual one-line content-type mismatch.
import assert from "node:assert/strict";
import { SupabaseCanonicalMediaStorage } from "../media/canonical-storage.ts";

function mockClient(opts: { allowedContentTypes: string[] }) {
  const uploadCalls: Array<{ path: string; contentType?: string }> = [];
  return {
    uploadCalls,
    client: {
      from: () => ({
        select: () => ({ eq: () => ({ in: async () => ({ data: [], error: null }) }) }),
        insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
        delete: () => ({ eq: async () => ({ error: null }) }),
      }),
      storage: {
        from: () => ({
          upload: async (path: string, _body: Uint8Array, uploadOpts?: { contentType?: string }) => {
            uploadCalls.push({ path, contentType: uploadOpts?.contentType });
            if (uploadOpts?.contentType && !opts.allowedContentTypes.includes(uploadOpts.contentType)) {
              return { error: { message: `mime type ${uploadOpts.contentType} is not supported` } };
            }
            return { error: null };
          },
          download: async () => ({ data: null, error: null }),
          remove: async () => ({ error: null }),
        }),
      },
    },
  };
}

async function run() {
  // The bucket's real allowlist never included application/octet-stream —
  // simulate it exactly, so a regression back to the old content type would
  // fail this test the same way it failed in production.
  const { client } = mockClient({
    allowedContentTypes: ["text/plain", "text/markdown", "text/csv", "application/json", "application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4"],
  });

  const storage = new SupabaseCanonicalMediaStorage({
    client: client as never,
    ownerId: "owner-1",
    tenantId: "tenant-1",
  });

  const writable = await storage.isWritable();
  assert.equal(writable, true, "isWritable() must succeed against a bucket with a realistic MIME allowlist that excludes application/octet-stream");

  console.log("PASS: SupabaseCanonicalMediaStorage.isWritable() uses a probe content type the real bucket actually allows");
}

run();
