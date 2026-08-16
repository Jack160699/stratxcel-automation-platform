// Run with: node --experimental-strip-types lib/social/__tests__/unified-6-connectors.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  const stepConnectors = read("app", "app", "onboarding", "steps", "StepConnectors.tsx");
  const types = read("app", "app", "onboarding", "types.ts");
  const oauthOrigin = read("lib", "social", "oauth-origin.ts");
  const connectRoute = read("app", "api", "social", "oauth", "[provider]", "connect", "route.ts");
  const callbackRoute = read("app", "api", "social", "oauth", "[provider]", "callback", "route.ts");
  const googleBusiness = read("lib", "social", "providers", "google-business.ts");
  const instagram = read("lib", "social", "providers", "instagram.ts");
  const facebook = read("lib", "social", "providers", "facebook.ts");
  const threads = read("lib", "social", "providers", "threads.ts");
  const linkedin = read("lib", "social", "providers", "linkedin.ts");
  const sendOtpRoute = read("app", "api", "platform", "onboarding", "whatsapp", "send-otp", "route.ts");
  const verifyOtpRoute = read("app", "api", "platform", "onboarding", "whatsapp", "verify-otp", "route.ts");

  // --- 1. Mandatory 6-Connector Order ----------------------------------------
  const expectedOrder = ["google_business", "instagram", "facebook", "threads", "linkedin", "whatsapp"];
  const matches = [...stepConnectors.matchAll(/key:\s*"([a-z_]+)"/g)].map((m) => m[1]);
  const cardKeys = matches.slice(0, 6);
  assert.deepEqual(
    cardKeys,
    expectedOrder,
    `Connectors must appear in mandatory order: ${expectedOrder.join(" -> ")}`
  );

  // Exclude Website and WhatsApp Business from Step 2
  assert.equal(cardKeys.includes("website"), false, "Website connector must NOT be in Step 2");
  assert.equal(stepConnectors.includes("WhatsApp Business"), false, "WhatsApp Business must NOT be in onboarding connector list");

  // --- 2. Google Business One-Tap Implementation -----------------------------
  assert.ok(stepConnectors.includes("Continue with Google"), "Google Business card must offer 'Continue with Google' CTA");
  assert.ok(googleBusiness.includes("business.manage"), "Google Business provider must request business.manage scope");
  assert.ok(googleBusiness.includes("accounts.google.com/o/oauth2/v2/auth"), "Google Business must use official OAuth2 endpoint");
  assert.ok(googleBusiness.includes("oauth2.googleapis.com/token"), "Google Business must exchange tokens at googleapis.com/token");

  // --- 3. Instagram Integrity ------------------------------------------------
  assert.ok(instagram.includes("META_INSTAGRAM_APP_ID"), "Instagram must use META_INSTAGRAM_APP_ID");
  assert.ok(instagram.includes("instagram.com/oauth/authorize"), "Instagram must use official authorize endpoint");
  assert.ok(instagram.includes("instagram_business_basic"), "Instagram must request business basic scope");

  // --- 4. Facebook Integrity -------------------------------------------------
  assert.ok(facebook.includes("META_APP_ID"), "Facebook must use META_APP_ID");
  assert.ok(facebook.includes("dialog/oauth"), "Facebook must use Facebook Login dialog endpoint");
  assert.ok(facebook.includes("pages_show_list"), "Facebook must request pages_show_list scope");

  // --- 5. Threads Authorization & Return -------------------------------------
  assert.ok(threads.includes("META_THREADS_APP_ID"), "Threads must use META_THREADS_APP_ID");
  assert.ok(threads.includes("threads.net/oauth/authorize"), "Threads must use official Threads authorize endpoint");
  assert.ok(threads.includes("threads_basic"), "Threads must request threads_basic scope");

  // --- 6. LinkedIn Deterministic Canonical Redirect URI -----------------------
  assert.ok(linkedin.includes("LINKEDIN_CLIENT_ID"), "LinkedIn must use LINKEDIN_CLIENT_ID");
  assert.ok(linkedin.includes("linkedin.com/oauth/v2"), "LinkedIn must use OAuth v2 endpoint");
  assert.ok(oauthOrigin.includes("https://www.stratxcel.in"), "oauthOrigin must use canonical HTTPS origin in production");
  assert.ok(connectRoute.includes("getCanonicalSocialRedirectUri"), "connect route must use getCanonicalSocialRedirectUri");
  assert.ok(callbackRoute.includes("getCanonicalSocialRedirectUri"), "callback route must use getCanonicalSocialRedirectUri");

  // --- 7. WhatsApp Number OTP Security Requirements --------------------------
  assert.ok(sendOtpRoute.includes("crypto.randomInt"), "send-otp must generate cryptographically random OTP");
  assert.ok(sendOtpRoute.includes("createHmac"), "send-otp must hash OTP with HMAC-SHA256");
  assert.ok(sendOtpRoute.includes("RESEND_COOLDOWN_MS"), "send-otp must enforce resend cooldown");
  assert.ok(sendOtpRoute.includes("normalizePhone"), "send-otp must normalize phone numbers to E.164");
  assert.ok(verifyOtpRoute.includes("timingSafeEqual"), "verify-otp must use timingSafeEqual for hash comparison");
  assert.ok(verifyOtpRoute.includes("onboarding_whatsapp_otp_state: null"), "verify-otp must invalidate OTP after success to prevent replay");
  assert.ok(verifyOtpRoute.includes("attemptsLeft"), "verify-otp must enforce attempt limits");
  assert.ok(verifyOtpRoute.includes("otp_verified"), "verify-otp must record connectionType as otp_verified");

  // --- 8. UI Attribution States ----------------------------------------------
  assert.ok(stepConnectors.includes("✓ Connected via"), "UI must render '✓ Connected via' badge");
  assert.ok(stepConnectors.includes("✓ WhatsApp number verified"), "UI must render '✓ WhatsApp number verified' badge");

  console.log(
    "unified-6-connectors.test.ts: ALL PASS (mandatory 6-connector order: Google Business -> Instagram -> Facebook -> Threads -> LinkedIn -> WhatsApp Number; deterministic canonical redirect URIs; Google Business one-tap OAuth; Threads & LinkedIn URI fixes; secure WhatsApp OTP verification with replay & timing protection; zero website/WhatsApp-Business duplication in Step 2)"
  );
}

run();
