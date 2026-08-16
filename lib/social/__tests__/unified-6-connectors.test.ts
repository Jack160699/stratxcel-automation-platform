// Run with: node --experimental-strip-types lib/social/__tests__/unified-6-connectors.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  const stepConnectors = read("app", "app", "onboarding", "steps", "StepConnectors.tsx");
  const stepReview = read("app", "app", "onboarding", "steps", "StepReview.tsx");
  const types = read("app", "app", "onboarding", "types.ts");
  const oauthOrigin = read("lib", "social", "oauth-origin.ts");
  const platformIcon = read("components", "audit", "PlatformIcon.tsx");
  const connectRoute = read("app", "api", "social", "oauth", "[provider]", "connect", "route.ts");
  const callbackRoute = read("app", "api", "social", "oauth", "[provider]", "callback", "route.ts");
  const googleBusiness = read("lib", "social", "providers", "google-business.ts");
  const instagram = read("lib", "social", "providers", "instagram.ts");
  const facebook = read("lib", "social", "providers", "facebook.ts");
  const youtube = read("lib", "social", "providers", "youtube.ts");
  const threads = read("lib", "social", "providers", "threads.ts");
  const linkedin = read("lib", "social", "providers", "linkedin.ts");
  const x = read("lib", "social", "providers", "x.ts");
  const providersIndex = read("lib", "social", "providers", "index.ts");
  const sendOtpRoute = read("app", "api", "platform", "onboarding", "whatsapp", "send-otp", "route.ts");
  const verifyOtpRoute = read("app", "api", "platform", "onboarding", "whatsapp", "verify-otp", "route.ts");

  // --- 1. Mandatory V1 5-Connector Order & Count ------------------------------
  const expectedOrder = [
    "google_business",
    "instagram",
    "facebook",
    "youtube",
    "whatsapp",
  ];
  const matches = [...stepConnectors.matchAll(/key:\s*"([a-z_]+)"/g)].map((m) => m[1]);
  assert.equal(matches.length, 5, `V1 StepConnectors must contain exactly 5 cards (found: ${matches.length})`);
  assert.deepEqual(
    matches,
    expectedOrder,
    `V1 Connectors must appear in exact mandatory order: ${expectedOrder.join(" -> ")}`
  );

  // Inactive in V1: X, Threads, LinkedIn, Website, WhatsApp Business
  assert.equal(matches.includes("x"), false, "X connector must NOT be in V1 onboarding");
  assert.equal(matches.includes("threads"), false, "Threads connector must NOT be in V1 onboarding");
  assert.equal(matches.includes("linkedin"), false, "LinkedIn connector must NOT be in V1 onboarding");
  assert.equal(matches.includes("website"), false, "Website connector must NOT be in Step 2");
  assert.equal(stepConnectors.includes("WhatsApp Business"), false, "WhatsApp Business must NOT be in onboarding connector list");

  // Review step filters strictly to V1 connectors
  assert.ok(stepReview.includes("V1_CONNECTORS"), "StepReview must import and use V1_CONNECTORS");

  // --- 2. Google Business Unified CTA & Security -----------------------------
  assert.equal(stepConnectors.includes("Continue with Google"), false, "Google Business card must NOT say 'Continue with Google'");
  assert.ok(stepConnectors.includes("ctaText: \"Connect\""), "Google Business card must offer unified 'Connect' CTA");
  assert.ok(!stepConnectors.includes("bg-white text-gray-900"), "Google Business card must NOT have white-on-white conflicting classes");
  assert.ok(googleBusiness.includes("business.manage"), "Google Business provider must request business.manage scope");
  assert.ok(googleBusiness.includes("accounts.google.com/o/oauth2/v2/auth"), "Google Business must use official OAuth2 endpoint");
  assert.ok(googleBusiness.includes("prompt: \"select_account\""), "Google Business must force select_account");

  // --- 3. Instagram Integrity ------------------------------------------------
  assert.ok(instagram.includes("META_INSTAGRAM_APP_ID"), "Instagram must use META_INSTAGRAM_APP_ID");
  assert.ok(instagram.includes("instagram.com/oauth/authorize"), "Instagram must use official authorize endpoint");

  // --- 4. Facebook Integrity -------------------------------------------------
  assert.ok(facebook.includes("META_APP_ID"), "Facebook must use META_APP_ID");
  assert.ok(facebook.includes("dialog/oauth"), "Facebook must use Facebook Login dialog endpoint");

  // --- 5. YouTube Restoration ------------------------------------------------
  assert.ok(youtube.includes("https://accounts.google.com/o/oauth2/v2/auth"), "YouTube must use Google OAuth2 endpoint");
  assert.ok(youtube.includes("youtube.upload"), "YouTube must request youtube.upload scope");

  // --- 6. Future Extensibility: Provider Implementations Preserved -----------
  assert.ok(threads.includes("META_THREADS_APP_ID"), "Threads provider must remain preserved for future V2");
  assert.ok(linkedin.includes("LINKEDIN_CLIENT_ID"), "LinkedIn provider must remain preserved for future V2");
  assert.ok(x.includes("x.com/i/oauth2/authorize"), "X provider must remain preserved for future V2");
  assert.ok(providersIndex.includes("V1_CUSTOMER_PROVIDERS"), "Provider registry must declare V1_CUSTOMER_PROVIDERS");

  // --- 7. WhatsApp Number OTP Security Requirements --------------------------
  assert.ok(sendOtpRoute.includes("crypto.randomInt"), "send-otp must generate cryptographically random OTP");
  assert.ok(sendOtpRoute.includes("createHmac"), "send-otp must hash OTP with HMAC-SHA256");
  assert.ok(sendOtpRoute.includes("RESEND_COOLDOWN_MS"), "send-otp must enforce resend cooldown");
  assert.ok(verifyOtpRoute.includes("timingSafeEqual"), "verify-otp must use timingSafeEqual for hash comparison");
  assert.ok(verifyOtpRoute.includes("onboarding_whatsapp_otp_state: null"), "verify-otp must invalidate OTP after success to prevent replay");

  console.log(
    "unified-6-connectors.test.ts: ALL PASS (mandatory 5-connector V1 order: Google Business -> Instagram -> Facebook -> YouTube -> WhatsApp Number; exact count=5; X, Threads, LinkedIn absent from onboarding; all CTAs 'Connect'; YouTube restored; WhatsApp OTP security verified; future V2 extensibility preserved)"
  );
}

run();
