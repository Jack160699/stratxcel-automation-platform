// Run with: node --experimental-strip-types lib/image-generation/__tests__/commercial-image-limits.test.ts
import assert from "node:assert/strict";
import { PLAN_DEFINITIONS, PLAN_LIMITS, PLAN_CAPABILITIES } from "@stratxcel/payments-and-wallet";

function run() {
  // 1. Free tier limit
  assert.equal(PLAN_LIMITS.free.image_generation_attempts_monthly, 3, "Free trial must allow exactly 3 image attempts/month");
  assert.equal(PLAN_CAPABILITIES.free.seo_execution, false, "Free trial must not execute SEO");
  assert.equal(PLAN_CAPABILITIES.free.social_autopilot, true, "Social Autopilot is now available on every plan, including Free trial (Unlock Autopilot For All Plans mission)");
  assert.equal(PLAN_CAPABILITIES.free.whatsapp_assistant_access, false, "Free trial must not have WhatsApp Autopilot");
  assert.equal(PLAN_CAPABILITIES.free.website_included, false, "Free trial must not include website generation");

  // 2. SEO Growth
  assert.equal(PLAN_DEFINITIONS.seo.priceCents, 299_900, "SEO Growth is ₹2,999/mo");
  assert.equal(PLAN_CAPABILITIES.seo.seo_execution, true, "SEO Growth has seo_execution");
  assert.equal(PLAN_CAPABILITIES.seo.social_autopilot, true, "Social Autopilot is now available on every plan, including SEO Growth (Unlock Autopilot For All Plans mission)");
  assert.equal(PLAN_CAPABILITIES.seo.whatsapp_assistant_access, false, "SEO Growth has no whatsapp autopilot");

  // 3. Social Content
  assert.equal(PLAN_DEFINITIONS.social.priceCents, 399_900, "Social Content is ₹3,999/mo");
  assert.equal(PLAN_LIMITS.social.social_posts, 28, "Social Content has 28 posts/mo");
  assert.equal(PLAN_CAPABILITIES.social.social_autopilot, true, "Social Autopilot is now available on every plan, including Social Content (Unlock Autopilot For All Plans mission)");

  // 4. Advanced Social
  assert.equal(PLAN_DEFINITIONS.advanced_social.priceCents, 849_900, "Advanced Social is ₹8,499/mo");
  assert.equal(PLAN_LIMITS.advanced_social.social_posts, 28, "Advanced Social has 28 posts/mo");
  assert.equal(PLAN_LIMITS.advanced_social.image_generation_attempts_monthly, 100, "Advanced Social has 100 image attempts/mo");
  assert.equal(PLAN_CAPABILITIES.advanced_social.social_autopilot, true, "Advanced Social has Social Autopilot");
  assert.equal(PLAN_CAPABILITIES.advanced_social.whatsapp_assistant_access, false, "Advanced Social has no WhatsApp Autopilot");

  // 5. Advanced Growth
  assert.equal(PLAN_DEFINITIONS.advanced_growth.priceCents, 1_849_800, "Advanced Growth is ₹18,498/mo");
  assert.equal(PLAN_LIMITS.advanced_growth.social_posts, 28, "Advanced Growth has 28 posts/mo");
  assert.equal(PLAN_LIMITS.advanced_growth.image_generation_attempts_monthly, 100, "Advanced Growth has 100 image attempts/mo");
  assert.equal(PLAN_CAPABILITIES.advanced_growth.seo_execution, true, "Advanced Growth has SEO execution");
  assert.equal(PLAN_CAPABILITIES.advanced_growth.social_autopilot, true, "Advanced Growth has Social Autopilot");
  assert.equal(PLAN_CAPABILITIES.advanced_growth.whatsapp_assistant_access, true, "Advanced Growth has WhatsApp Autopilot");
  assert.equal(PLAN_CAPABILITIES.advanced_growth.landing_page_bonus, true, "Advanced Growth has Free Landing Page bonus");

  // 6. Website products
  assert.equal(PLAN_DEFINITIONS.website_landing_page.priceCents, 99_900, "Landing Page is ₹999 one-time");
  assert.equal(PLAN_DEFINITIONS.website_standard.priceCents, 299_900, "5-6 Page Website is ₹2,999 one-time");
  assert.equal(PLAN_DEFINITIONS.website_custom.priceCents, null, "Custom Website is custom quote");

  console.log("commercial-image-limits.test.ts: ALL PASS");
}

run();
