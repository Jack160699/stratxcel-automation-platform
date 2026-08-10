// Run with: node --experimental-strip-types lib/owner-brain/__tests__/connectors.test.ts
import assert from "node:assert/strict";
import { extractDomain, mapGitHubEventType } from "../connectors/pure.ts";
import { buildGoogleAuthorizeUrl, safeGoogleOAuthError, scopeForGoogleSource } from "../connectors/google-oauth.ts";
import { connectorEnvReady, getSourceDefinition, SOURCE_REGISTRY } from "../sources/registry.ts";

function run() {
  // --- extractDomain (Gmail "To" header -> redacted recipient domain only) ---
  assert.equal(extractDomain("Jane Doe <jane@example.com>"), "example.com");
  assert.equal(extractDomain("jane@sub.example.co.in"), "sub.example.co.in");
  assert.equal(extractDomain("not-an-email"), "unknown", "malformed input must degrade safely, never throw");
  assert.equal(extractDomain(""), "unknown");

  // --- GitHub event-type mapping (only structural events map; everything else is dropped, not stored as "unknown") ---
  assert.equal(mapGitHubEventType("PushEvent"), "github_commit");
  assert.equal(mapGitHubEventType("PullRequestEvent"), "github_pull_request");
  assert.equal(mapGitHubEventType("PullRequestReviewEvent"), "github_pull_request");
  assert.equal(mapGitHubEventType("IssuesEvent"), "github_issue");
  assert.equal(mapGitHubEventType("IssueCommentEvent"), "github_issue");
  assert.equal(mapGitHubEventType("ForkEvent"), null, "event types with no owner_events mapping must be dropped, not misclassified");
  assert.equal(mapGitHubEventType("WatchEvent"), null);

  // --- Google scope-per-source: least-privilege, one scope per source, never a combined "everything" scope ---
  assert.equal(scopeForGoogleSource("gmail"), "https://www.googleapis.com/auth/gmail.readonly");
  assert.equal(scopeForGoogleSource("google_calendar"), "https://www.googleapis.com/auth/calendar.readonly");
  assert.equal(scopeForGoogleSource("google_drive"), "https://www.googleapis.com/auth/drive.readonly");
  assert.throws(() => scopeForGoogleSource("not_a_real_source"), "an unregistered source must throw rather than silently return a broad scope");
  for (const scope of ["gmail", "google_calendar", "google_drive"].map(scopeForGoogleSource)) {
    assert.ok(scope.endsWith(".readonly"), `every Google scope must be read-only, got: ${scope}`);
  }

  process.env.GOOGLE_OWNER_BRAIN_CLIENT_ID = "owner-brain-client";
  for (const sourceKey of ["google_calendar", "google_drive"]) {
    const authorizeUrl = new URL(buildGoogleAuthorizeUrl({ state: "signed.state", redirectUri: "https://www.stratxcel.in/api/admin/operating-brain/connectors/google/callback", sourceKey }));
    assert.equal(authorizeUrl.origin, "https://accounts.google.com");
    assert.equal(authorizeUrl.searchParams.get("scope"), scopeForGoogleSource(sourceKey));
    assert.equal(authorizeUrl.searchParams.get("state"), "signed.state");
    assert.equal(authorizeUrl.searchParams.get("access_type"), "offline");
    assert.equal(authorizeUrl.searchParams.get("prompt"), "consent");
  }
  assert.deepEqual(safeGoogleOAuthError("access_denied", "user detail must not leak"), {
    code: "access_denied",
    message: "Google access was denied. Approve the requested read-only permission and try again.",
  });
  assert.equal(safeGoogleOAuthError("unknown-error!", "private account detail").message.includes("private account detail"), false);

  // --- Source registry integrity ---
  assert.equal(SOURCE_REGISTRY.length, 10, "brief specifies 10 sources");
  assert.equal(getSourceDefinition("gmail").displayName, "Gmail");
  assert.throws(() => getSourceDefinition("not_a_real_source" as never), "unknown source key must throw, not return undefined silently");

  delete process.env.GOOGLE_OWNER_BRAIN_CLIENT_ID;
  delete process.env.GOOGLE_OWNER_BRAIN_CLIENT_SECRET;
  assert.equal(connectorEnvReady("gmail"), false, "without client id/secret env vars, gmail must not report ready");
  process.env.GOOGLE_OWNER_BRAIN_CLIENT_ID = "test-id";
  process.env.GOOGLE_OWNER_BRAIN_CLIENT_SECRET = "test-secret";
  assert.equal(connectorEnvReady("gmail"), true, "with both env vars set, gmail must report ready");
  assert.equal(connectorEnvReady("chat_platforms"), true, "provider-based chat platform registry is implemented without a fake universal OAuth prerequisite");
  delete process.env.GOOGLE_OWNER_BRAIN_CLIENT_ID;
  delete process.env.GOOGLE_OWNER_BRAIN_CLIENT_SECRET;

  console.log("connectors.test.ts (owner-brain): ALL PASS (extractDomain, GitHub event mapping, Google scope least-privilege, registry integrity, env-readiness gating)");
}

run();
