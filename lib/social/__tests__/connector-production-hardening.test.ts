// Run with: node --experimental-strip-types lib/social/__tests__/connector-production-hardening.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCanonicalSocialRedirectUri } from "../oauth-origin.ts";
import { getCodeVerifierFromState, getCodeChallenge, xProvider } from "../providers/x.ts";
import { googleBusinessProvider } from "../providers/google-business.ts";
import { linkedinProvider } from "../providers/linkedin.ts";
import { threadsProvider } from "../providers/threads.ts";
import { youtubeProvider } from "../providers/youtube.ts";
import { getProvider, isValidProvider } from "../providers/index.ts";
import { getProviderConfigDiagnostics } from "../oauth-diagnostics.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  process.env.GOOGLE_BUSINESS_CLIENT_ID = process.env.GOOGLE_BUSINESS_CLIENT_ID || "test-google-business-client-id";
  process.env.GOOGLE_BUSINESS_CLIENT_SECRET = process.env.GOOGLE_BUSINESS_CLIENT_SECRET || "test-google-business-client-secret";
  process.env.LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID || "test-linkedin-client-id";
  process.env.LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || "test-linkedin-client-secret";
  process.env.X_CLIENT_ID = process.env.X_CLIENT_ID || "test-x-client-id";
  process.env.X_CLIENT_SECRET = process.env.X_CLIENT_SECRET || "test-x-client-secret";
  process.env.YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || "test-youtube-client-id";
  process.env.YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || "test-youtube-client-secret";
  process.env.META_THREADS_APP_ID = process.env.META_THREADS_APP_ID || "test-threads-app-id";
  process.env.META_THREADS_APP_SECRET = process.env.META_THREADS_APP_SECRET || "test-threads-app-secret";
  process.env.META_INSTAGRAM_APP_ID = process.env.META_INSTAGRAM_APP_ID || "test-instagram-app-id";
  process.env.META_INSTAGRAM_APP_SECRET = process.env.META_INSTAGRAM_APP_SECRET || "test-instagram-app-secret";
  process.env.META_APP_ID = process.env.META_APP_ID || "test-facebook-app-id";
  process.env.META_APP_SECRET = process.env.META_APP_SECRET || "test-facebook-app-secret";

  const stepConnectors = read("app", "app", "onboarding", "steps", "StepConnectors.tsx");
  const platformIcon = read("components", "audit", "PlatformIcon.tsx");
  const adminPlatformIcon = read("app", "admin", "(shell)", "social", "components", "PlatformIcon.tsx");
  const connectRoute = read("app", "api", "social", "oauth", "[provider]", "connect", "route.ts");
  const callbackRoute = read("app", "api", "social", "oauth", "[provider]", "callback", "route.ts");
  const diagnosticsModule = read("lib", "social", "oauth-diagnostics.ts");

  // =========================================================================
  // 1. General Connector Order and Unified "Connect" CTA
  // =========================================================================
  const expectedOrder = [
    "google_business",
    "instagram",
    "facebook",
    "youtube",
    "threads",
    "linkedin",
    "x",
    "whatsapp",
  ];
  const matches = [...stepConnectors.matchAll(/key:\s*"([a-z_]+)"/g)].map((m) => m[1]);
  const cardKeys = matches.slice(0, 8);
  assert.deepEqual(
    cardKeys,
    expectedOrder,
    `Connectors must appear in mandatory order: ${expectedOrder.join(" -> ")}`
  );

  // Assert all 8 cards have ctaText: "Connect"
  const ctaMatches = [...stepConnectors.matchAll(/ctaText:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ctaMatches.length >= 8, "Expected at least 8 ctaText entries in StepConnectors");
  for (const cta of ctaMatches.slice(0, 8)) {
    assert.equal(cta, "Connect", `All initial connector cards must have ctaText 'Connect' (found: '${cta}')`);
  }

  // Google Business must NOT offer "Continue with Google"
  assert.equal(
    stepConnectors.includes("Continue with Google"),
    false,
    "Google Business must NOT say 'Continue with Google'"
  );

  // =========================================================================
  // 2. Single Canonical Redirect URI Architecture
  // =========================================================================
  assert.equal(
    getCanonicalSocialRedirectUri("google_business"),
    "https://www.stratxcel.in/api/social/oauth/google_business/callback",
    "Google Business canonical redirect URI mismatch"
  );
  assert.equal(
    getCanonicalSocialRedirectUri("google"),
    "https://www.stratxcel.in/api/social/oauth/google_business/callback",
    "Google alias must resolve to google_business callback"
  );
  assert.equal(
    getCanonicalSocialRedirectUri("linkedin"),
    "https://www.stratxcel.in/api/social/oauth/linkedin/callback",
    "LinkedIn canonical redirect URI mismatch"
  );
  assert.equal(
    getCanonicalSocialRedirectUri("x"),
    "https://www.stratxcel.in/api/social/oauth/x/callback",
    "X canonical redirect URI mismatch"
  );
  assert.equal(
    getCanonicalSocialRedirectUri("twitter"),
    "https://www.stratxcel.in/api/social/oauth/x/callback",
    "Twitter alias must resolve to X callback"
  );
  assert.equal(
    getCanonicalSocialRedirectUri("threads"),
    "https://www.stratxcel.in/api/social/oauth/threads/callback",
    "Threads canonical redirect URI mismatch"
  );
  assert.equal(
    getCanonicalSocialRedirectUri("youtube"),
    "https://www.stratxcel.in/api/social/oauth/youtube/callback",
    "YouTube canonical redirect URI mismatch"
  );

  // Local development redirect URI preservation
  assert.equal(
    getCanonicalSocialRedirectUri("linkedin", "http://localhost:3322"),
    "http://localhost:3322/api/social/oauth/linkedin/callback",
    "Local dev origin must be preserved for localhost"
  );

  // =========================================================================
  // 3. Google Business Profile Provider Validation
  // =========================================================================
  assert.equal(googleBusinessProvider.name, "google_business");
  assert.ok(
    googleBusinessProvider.requiredScopes.includes("https://www.googleapis.com/auth/business.manage"),
    "Google Business must request business.manage scope"
  );
  assert.ok(
    googleBusinessProvider.requiredScopes.includes("openid"),
    "Google Business must request openid scope"
  );
  assert.ok(
    googleBusinessProvider.requiredScopes.includes("profile"),
    "Google Business must request profile scope"
  );

  const googleBusinessAuthUrl = googleBusinessProvider.getAuthorizationUrl(
    "test-state-token",
    "https://www.stratxcel.in/api/social/oauth/google_business/callback"
  );
  assert.ok(googleBusinessAuthUrl.startsWith("https://accounts.google.com/o/oauth2/v2/auth"));
  assert.ok(googleBusinessAuthUrl.includes("access_type=offline"));
  assert.ok(
    googleBusinessAuthUrl.includes("prompt=select_account"),
    "Google Business must explicitly set prompt=select_account to force account selection"
  );
  assert.equal(
    googleBusinessAuthUrl.includes("login_hint"),
    false,
    "Google Business must not provide an admin/user login_hint"
  );
  assert.ok(googleBusinessAuthUrl.includes("response_type=code"));

  // =========================================================================
  // 4. LinkedIn OpenID Connect & Self-Serve Sharing Provider Validation
  // =========================================================================
  assert.equal(linkedinProvider.name, "linkedin");
  assert.ok(linkedinProvider.requiredScopes.includes("openid"), "LinkedIn must request openid");
  assert.ok(linkedinProvider.requiredScopes.includes("profile"), "LinkedIn must request profile");
  assert.ok(linkedinProvider.requiredScopes.includes("email"), "LinkedIn must request email");
  assert.ok(linkedinProvider.requiredScopes.includes("w_member_social"), "LinkedIn must request w_member_social");

  const linkedinAuthUrl = linkedinProvider.getAuthorizationUrl(
    "test-linkedin-state",
    "https://www.stratxcel.in/api/social/oauth/linkedin/callback"
  );
  assert.ok(linkedinAuthUrl.startsWith("https://www.linkedin.com/oauth/v2/authorization"));
  assert.ok(linkedinAuthUrl.includes("response_type=code"));
  assert.ok(linkedinAuthUrl.includes("openid"));
  assert.ok(linkedinAuthUrl.includes("w_member_social"));

  // =========================================================================
  // 5. X OAuth 2.0 PKCE Derivation & Provider Validation
  // =========================================================================
  assert.equal(xProvider.name, "x");
  assert.ok(xProvider.requiredScopes.includes("tweet.read"));
  assert.ok(xProvider.requiredScopes.includes("tweet.write"));
  assert.ok(xProvider.requiredScopes.includes("users.read"));
  assert.ok(xProvider.requiredScopes.includes("offline.access"));

  const testState = "random-signed-state-payload-12345";
  const verifier1 = getCodeVerifierFromState(testState);
  const verifier2 = getCodeVerifierFromState(testState);
  assert.equal(verifier1, verifier2, "PKCE code_verifier derivation must be deterministic for the same state");
  assert.ok(verifier1.length >= 32, "PKCE code_verifier must have adequate entropy");

  const challenge1 = getCodeChallenge(verifier1);
  const challenge2 = getCodeChallenge(verifier1);
  assert.equal(challenge1, challenge2, "PKCE code_challenge derivation must be deterministic");

  const xAuthUrl = xProvider.getAuthorizationUrl(
    testState,
    "https://www.stratxcel.in/api/social/oauth/x/callback"
  );
  assert.ok(xAuthUrl.startsWith("https://x.com/i/oauth2/authorize"));
  assert.ok(xAuthUrl.includes("code_challenge="));
  assert.ok(xAuthUrl.includes("code_challenge_method=S256"));
  assert.ok(xAuthUrl.includes("response_type=code"));

  // =========================================================================
  // 6. Threads Canonical Mark & Provider Validation
  // =========================================================================
  assert.equal(threadsProvider.name, "threads");
  assert.ok(threadsProvider.requiredScopes.includes("threads_basic"));
  assert.ok(threadsProvider.requiredScopes.includes("threads_content_publish"));

  // Both PlatformIcon components must render the official Meta Threads spiral mark
  const threadsSpiralSignature = "141.537 88.9883";
  assert.ok(
    platformIcon.includes(threadsSpiralSignature),
    "Public/Audit PlatformIcon must render official Meta Threads spiral mark"
  );
  assert.ok(
    adminPlatformIcon.includes(threadsSpiralSignature),
    "Admin PlatformIcon must render official Meta Threads spiral mark"
  );

  // =========================================================================
  // 7. YouTube Provider Validation
  // =========================================================================
  assert.equal(youtubeProvider.name, "youtube");
  assert.ok(youtubeProvider.requiredScopes.includes("https://www.googleapis.com/auth/youtube.upload"));
  assert.ok(youtubeProvider.requiredScopes.includes("https://www.googleapis.com/auth/youtube.readonly"));

  const ytAuthUrl = youtubeProvider.getAuthorizationUrl(
    "test-yt-state",
    "https://www.stratxcel.in/api/social/oauth/youtube/callback"
  );
  assert.ok(ytAuthUrl.startsWith("https://accounts.google.com/o/oauth2/v2/auth"));
  assert.ok(ytAuthUrl.includes("access_type=offline"));
  assert.ok(ytAuthUrl.includes("prompt=consent"));

  // =========================================================================
  // 8. Provider Registry Integrity
  // =========================================================================
  for (const providerKey of ["google_business", "instagram", "facebook", "youtube", "threads", "linkedin", "x"]) {
    assert.ok(isValidProvider(providerKey), `Provider '${providerKey}' must be valid in registry`);
    const p = getProvider(providerKey);
    assert.ok(p, `Provider instance '${providerKey}' must be resolvable`);
    assert.ok(p.requiredScopes.length > 0, `Provider '${providerKey}' must define required scopes`);
  }

  // =========================================================================
  // 9. Safe Diagnostics Layer Inspection
  // =========================================================================
  assert.ok(diagnosticsModule.includes("OAuthStage"), "Diagnostics module must define OAuthStage");
  assert.ok(diagnosticsModule.includes("recordOAuthDiagnostic"), "Diagnostics module must export recordOAuthDiagnostic");
  assert.ok(diagnosticsModule.includes("getProviderConfigDiagnostics"), "Diagnostics module must export getProviderConfigDiagnostics");

  const diagnostics = getProviderConfigDiagnostics();
  assert.ok(diagnostics.google_business, "Diagnostics must include google_business");
  assert.ok(diagnostics.linkedin, "Diagnostics must include linkedin");
  assert.ok(diagnostics.x, "Diagnostics must include x");
  assert.ok(diagnostics.threads, "Diagnostics must include threads");
  assert.ok(diagnostics.youtube, "Diagnostics must include youtube");
  assert.ok(diagnostics.instagram, "Diagnostics must include instagram");
  assert.ok(diagnostics.facebook, "Diagnostics must include facebook");

  for (const [pName, diag] of Object.entries(diagnostics)) {
    assert.equal(typeof diag.configured, "boolean", `${pName} configured must be boolean`);
    assert.equal(typeof diag.clientIdPresent, "boolean", `${pName} clientIdPresent must be boolean`);
    assert.equal(typeof diag.clientSecretPresent, "boolean", `${pName} clientSecretPresent must be boolean`);
    assert.ok(diag.canonicalRedirectUri.startsWith("https://www.stratxcel.in"), `${pName} canonical redirect must use https://www.stratxcel.in`);
    assert.equal(diag.expectedProductionOrigin, "https://www.stratxcel.in", `${pName} production origin must be https://www.stratxcel.in`);
    assert.ok(Array.isArray(diag.requiredScopes), `${pName} requiredScopes must be array`);
  }

  // =========================================================================
  // 10. Callback & Connect Route Integrity
  // =========================================================================
  assert.ok(callbackRoute.includes("recordOAuthDiagnostic"), "Callback route must log structured OAuth diagnostics");
  assert.ok(connectRoute.includes("recordOAuthDiagnostic"), "Connect route must log structured OAuth diagnostics");
  assert.ok(callbackRoute.includes("exchangeCodeForToken(code, redirectUri, {"), "Callback route must pass options into exchangeCodeForToken");

  console.log(
    "connector-production-hardening.test.ts: ALL PASS (Google Business, LinkedIn, X, Threads, YouTube, Instagram, Facebook, WhatsApp Number; Unified Connect CTAs; S256 PKCE derivation; Official Threads spiral marks; Safe Diagnostics Layer; Single Canonical Redirect Architecture verified)"
  );
}

run();
