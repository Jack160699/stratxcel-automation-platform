// Regression test for a finding from live E2E testing on 2026-08-24:
// googleBusinessProvider.publish() never contacted Google at all — it
// returned a fabricated externalPostId (`gbp-post-${Date.now()}`) and a
// generic, non-specific permalink (`https://business.google.com`)
// unconditionally, so every "published" Google Post was a fabricated
// success (violates Section 27/31: never claim publication without
// provider success). getInsights() was the same pattern — always
// `{ views: 0, searches: 0, actions: 0 }` regardless of the real post, and
// verified dead code (grepped the whole repo: never called anywhere).
//
// Fix: publish() now makes the real Local Posts call
// (POST https://mybusiness.googleapis.com/v4/{externalAccountId}/localPosts)
// and throws a real, honest error on any non-ok response instead of
// fabricating success. getInsights() was removed rather than left as a
// dead fake stub — it's optional on SocialProvider and had no real caller.
//
// Runs the real module directly (google-business.ts's only non-type
// dependency is fetch, which this test mocks) rather than a source-text
// check, so the actual request/response handling is exercised.
// Run with: node --experimental-strip-types lib/social/__tests__/google-business-publish-honesty.test.ts
import assert from "node:assert/strict";
import { googleBusinessProvider, isResolvedGbpLocationResourceName } from "../providers/google-business.ts";

async function run() {
  const basePublishInput = {
    accessToken: "test_access_token",
    externalAccountId: "accounts/123/locations/456",
    caption: "Real StratXcel post content",
    mediaUrls: ["https://cdn.example.com/real-image.jpg"],
  };

  // --- getInsights must not exist at all — no fabricated metrics. --------
  assert.equal(
    (googleBusinessProvider as { getInsights?: unknown }).getInsights,
    undefined,
    "getInsights must be removed, not left as a fake-zeros stub — it was verified dead code with no real caller"
  );

  // --- publish() must call the real Local Posts endpoint. ----------------
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  try {
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedInit = init;
      return {
        ok: true,
        status: 200,
        json: async () => ({ name: "accounts/123/locations/456/localPosts/real-post-789", searchUrl: "https://posts.gle/AbCdEf" }),
      } as Response;
    }) as typeof fetch;

    const result = await googleBusinessProvider.publish(basePublishInput);

    assert.equal(capturedUrl, "https://mybusiness.googleapis.com/v4/accounts/123/locations/456/localPosts", "must call the real Local Posts endpoint for the given account/location");
    assert.equal((capturedInit?.headers as Record<string, string>)?.Authorization, "Bearer test_access_token");
    const sentBody = JSON.parse(String(capturedInit?.body));
    assert.equal(sentBody.summary, "Real StratXcel post content", "the real caption must reach Google, not a placeholder");
    assert.deepEqual(sentBody.media, [{ mediaFormat: "PHOTO", sourceUrl: "https://cdn.example.com/real-image.jpg" }]);

    // The result must be exactly what Google returned — not a fabricated id/permalink.
    assert.equal(result.externalPostId, "accounts/123/locations/456/localPosts/real-post-789");
    assert.equal(result.permalink, "https://posts.gle/AbCdEf");
    assert.notEqual(result.permalink, "https://business.google.com", "must never fall back to the old generic non-specific permalink");
    assert.ok(!/^gbp-post-\d+$/.test(result.externalPostId), "must never return the old fabricated gbp-post-<timestamp> id shape");

    // --- A failed Google call must throw a real, honest error, never a fabricated success. ---
    globalThis.fetch = (async () => ({
      ok: false,
      status: 403,
      text: async () => '{"error":{"message":"The caller does not have permission"}}',
    })) as unknown as typeof fetch;

    await assert.rejects(
      () => googleBusinessProvider.publish(basePublishInput),
      /Google Business post publish failed \(403\)/,
      "a real provider rejection must surface as a real thrown error, not a fabricated success"
    );

    // --- A 200 with no post name is not confirmable success either. --------
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    await assert.rejects(
      () => googleBusinessProvider.publish(basePublishInput),
      /returned no post name/,
      "an ok response with no post name must not be treated as a confirmed publish"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("PASS: google-business publish() makes a real call and never fabricates success; getInsights() is gone, not faked");

  // --- isResolvedGbpLocationResourceName: real vs OAuth-fallback ids. -----
  // Found live against the real StratXcel tenant (see
  // docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update 10): its
  // stored provider_account_id is exactly the bare-id fallback shape below.
  assert.equal(isResolvedGbpLocationResourceName("accounts/123/locations/456"), true, "a real resolved resource name must classify as resolved");
  assert.equal(isResolvedGbpLocationResourceName("118157607743139723110"), false, "a bare numeric OAuth fallback id must not be mistaken for a resolved location");
  assert.equal(isResolvedGbpLocationResourceName("accounts/123"), false, "an account with no location segment is not a usable location resource");
  assert.equal(isResolvedGbpLocationResourceName(""), false, "an empty id is never resolved");
  console.log("PASS: isResolvedGbpLocationResourceName distinguishes real resolved locations from the OAuth-time fallback id");
}

run();
