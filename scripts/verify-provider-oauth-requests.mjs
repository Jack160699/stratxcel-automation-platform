import assert from "node:assert/strict";
import { getProvider } from "../lib/social/providers/index.ts";
import { createSignedState } from "../lib/social/oauth-state.ts";

process.env.META_INSTAGRAM_APP_ID = process.env.META_INSTAGRAM_APP_ID || "1234567890";
process.env.META_APP_ID = process.env.META_APP_ID || "1234567890";
process.env.META_THREADS_APP_ID = process.env.META_THREADS_APP_ID || "1234567890";
process.env.LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID || "linkedin-client-123";
process.env.YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || "google-yt-client-123";
process.env.SOCIAL_OAUTH_STATE_SECRET = process.env.SOCIAL_OAUTH_STATE_SECRET || "dev-secret-state-key-min-32-chars-long";

const PROD_ORIGIN = "https://www.stratxcel.in";

function verifyProviderOAuth(providerName) {
  const provider = getProvider(providerName);
  const { token } = createSignedState(providerName, "/app");
  const canonicalRedirectUri = `${PROD_ORIGIN}/api/social/oauth/${providerName}/callback`;

  const authUrl = provider.getAuthorizationUrl(token, canonicalRedirectUri);
  const parsed = new URL(authUrl);

  console.log(`\n--- Provider: ${providerName.toUpperCase()} ---`);
  console.log(`OAuth Host: ${parsed.origin}${parsed.pathname}`);
  console.log(`Redirect URI param: ${parsed.searchParams.get("redirect_uri")}`);
  console.log(`Response Type: ${parsed.searchParams.get("response_type")}`);
  console.log(`Scope: ${parsed.searchParams.get("scope")}`);
  console.log(`State present: ${Boolean(parsed.searchParams.get("state"))}`);

  assert.equal(parsed.searchParams.get("redirect_uri"), canonicalRedirectUri, `Redirect URI for ${providerName} must match registered URI exactly`);
  assert.equal(parsed.searchParams.get("response_type"), "code", `Response type for ${providerName} must be 'code'`);
  assert.ok(parsed.searchParams.get("state"), `State token for ${providerName} must be present`);
}

console.log("================================================================================");
console.log("VERIFYING OAUTH REQUEST GENERATION FOR ALL SOCIAL PROVIDERS");
console.log("================================================================================");

verifyProviderOAuth("instagram");
verifyProviderOAuth("facebook");
verifyProviderOAuth("threads");
verifyProviderOAuth("linkedin");
verifyProviderOAuth("youtube");

console.log("\n================================================================================");
console.log("ALL PROVIDER OAUTH URL GENERATIONS VERIFIED WITH CANONICAL REGISTERED CALLBACK");
console.log("================================================================================");
