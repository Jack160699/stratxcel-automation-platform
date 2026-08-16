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
  const sendOtpRoute = read("app", "api", "platform", "onboarding", "whatsapp", "send-otp", "route.ts");
  const verifyOtpRoute = read("app", "api", "platform", "onboarding", "whatsapp", "verify-otp", "route.ts");

  // --- 1. Mandatory 8-Connector Order ----------------------------------------
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

  // Exclude Website and WhatsApp Business from Step 2
  assert.equal(cardKeys.includes("website"), false, "Website connector must NOT be in Step 2");
  assert.equal(stepConnectors.includes("WhatsApp Business"), false, "WhatsApp Business must NOT be in onboarding connector list");

  // --- 2. Google Business One-Tap & CTA Visibility --------------------------
  assert.ok(stepConnectors.includes("Continue with Google"), "Google Business card must offer 'Continue with Google' CTA");
  assert.ok(!stepConnectors.includes("bg-white text-gray-900"), "Google Business card must NOT have white-on-white conflicting classes");
  assert.ok(googleBusiness.includes("business.manage"), "Google Business provider must request business.manage scope");
  assert.ok(googleBusiness.includes("accounts.google.com/o/oauth2/v2/auth"), "Google Business must use official OAuth2 endpoint");

  // --- 3. Instagram Integrity ------------------------------------------------
  assert.ok(instagram.includes("META_INSTAGRAM_APP_ID"), "Instagram must use META_INSTAGRAM_APP_ID");
  assert.ok(instagram.includes("instagram.com/oauth/authorize"), "Instagram must use official authorize endpoint");

  // --- 4. Facebook Integrity -------------------------------------------------
  assert.ok(facebook.includes("META_APP_ID"), "Facebook must use META_APP_ID");
  assert.ok(facebook.includes("dialog/oauth"), "Facebook must use Facebook Login dialog endpoint");

  // --- 5. YouTube Restoration ------------------------------------------------
  assert.ok(youtube.includes("https://accounts.google.com/o/oauth2/v2/auth"), "YouTube must use Google OAuth2 endpoint");
  assert.ok(youtube.includes("youtube.upload"), "YouTube must request youtube.upload scope");

  // --- 6. Threads Authorization & Official Vector Icon -----------------------
  assert.ok(threads.includes("META_THREADS_APP_ID"), "Threads must use META_THREADS_APP_ID");
  assert.ok(threads.includes("threads.net/oauth/authorize"), "Threads must use official Threads authorize endpoint");
  assert.ok(platformIcon.includes("141.537 88.9883"), "PlatformIcon must render official Meta Threads spiral brand vector");

  // --- 7. LinkedIn Deterministic Canonical Redirect URI -----------------------
  assert.ok(linkedin.includes("LINKEDIN_CLIENT_ID"), "LinkedIn must use LINKEDIN_CLIENT_ID");
  assert.ok(linkedin.includes("linkedin.com/oauth/v2"), "LinkedIn must use OAuth v2 endpoint");
  assert.ok(oauthOrigin.includes("https://www.stratxcel.in"), "oauthOrigin must use canonical HTTPS origin in production");

  // --- 8. X (Twitter) OAuth 2.0 & Official Vector Logo ------------------------
  assert.ok(x.includes("x.com/i/oauth2/authorize"), "X provider must use x.com/i/oauth2/authorize");
  assert.ok(x.includes("api.x.com/2/oauth2/token"), "X provider must use api.x.com/2/oauth2/token");
  assert.ok(platformIcon.includes("M18.244 2.25h3.308l-7.227 8.26"), "PlatformIcon must render official X logo vector");

  // --- 9. WhatsApp Number OTP Security Requirements --------------------------
  assert.ok(sendOtpRoute.includes("crypto.randomInt"), "send-otp must generate cryptographically random OTP");
  assert.ok(sendOtpRoute.includes("createHmac"), "send-otp must hash OTP with HMAC-SHA256");
  assert.ok(sendOtpRoute.includes("RESEND_COOLDOWN_MS"), "send-otp must enforce resend cooldown");
  assert.ok(verifyOtpRoute.includes("timingSafeEqual"), "verify-otp must use timingSafeEqual for hash comparison");
  assert.ok(verifyOtpRoute.includes("onboarding_whatsapp_otp_state: null"), "verify-otp must invalidate OTP after success to prevent replay");

  console.log(
    "unified-6-connectors.test.ts: ALL PASS (mandatory 8-connector order: Google Business -> Instagram -> Facebook -> YouTube -> Threads -> LinkedIn -> X -> WhatsApp Number; YouTube restored; X OAuth 2.0 + official mark; official Threads spiral mark; Google Business CTA fixed without conflicting classes; WhatsApp OTP security verified)"
  );
}

run();
