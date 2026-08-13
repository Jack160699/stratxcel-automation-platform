import assert from "node:assert/strict";
import { buildBrandBrainContentFromAuditIntake, isBrandBrainCurrentForAudit } from "../brand-brain.ts";

const order = {
  id: "audit-order-1",
  business_name: "Gupta Garments",
  industry: null,
  website_url: "https://guptagarments.example",
  social_links: ["https://instagram.com/guptagarments"],
  deep_dive_answers: {
    intakeMeta: { updatedAt: "2026-08-12T12:00:00.000Z" },
    gstInvoice: {
      legalBusinessName: "Gupta Garments Pvt Ltd",
      gstin: "22AAAAA0000A1Z5",
      billingAddress: "Private billing address",
    },
    businessDescription: "Women's clothing shop",
    businessReach: "city",
    location: "Bhilai, Chhattisgarh",
    majorProducts: "Sarees\nKurtis\nBridal wear",
    priorityOffering: "Bridal wear",
    customerSegments: ["women", "families"],
    customerAgeGroups: ["25_34", "35_44"],
    reasonsChosen: ["trusted_locally", "better_quality"],
    averageSpend: "1000_5000",
    discoveryChannels: ["walk_ins", "instagram", "referrals"],
    purchaseChannels: ["shop_office", "whatsapp"],
    biggestProblem: "not_enough_customers",
    competitors: "Style House\nFashion Point",
    currentMarketing: ["social_posting", "whatsapp_marketing"],
    bestCustomerSource: "referrals",
    brandPersonality: ["friendly", "trustworthy", "modern"],
  },
  goals_answers: {
    primaryGoal: "more_customers",
    successDefinition: "50 more enquiries a month",
    triedAlready: "Boosted Instagram posts without clear results",
    additionalNotes: "Wedding season is our strongest period",
  },
};

const content = buildBrandBrainContentFromAuditIntake(order, {
  rules: ["Never claim a discount unless active"],
  pillars: ["Trust"],
});

assert.equal(content.business_name, "Gupta Garments");
assert.equal(content.business_description, "Women's clothing shop");
assert.equal(content.target_audience, "women, families");
assert.deepEqual(content.products, [
  { name: "Sarees", description: "" },
  { name: "Kurtis", description: "" },
  { name: "Bridal wear", description: "" },
]);
assert.deepEqual(content.discovery_channels, ["walk_ins", "instagram", "referrals"]);
assert.deepEqual(content.online_profiles, ["https://instagram.com/guptagarments"]);
assert.deepEqual(content.rules, ["Never claim a discount unless active"]);
assert.deepEqual(content.pillars, ["Trust"]);
assert.equal(content.audit_order_id, "audit-order-1");
assert.equal(content.audit_intake_updated_at, "2026-08-12T12:00:00.000Z");
assert.equal(content.website_url, "https://guptagarments.example");
const preservedWebsite = buildBrandBrainContentFromAuditIntake(order, {
  website_url: "https://customer-edited.example",
  audit_synced_website_url: "https://old-audit.example",
});
assert.equal(preservedWebsite.website_url, "https://customer-edited.example", "Customer-edited website remains highest truth");
assert.equal(isBrandBrainCurrentForAudit(order, content), true);
assert.equal(isBrandBrainCurrentForAudit({
  ...order,
  deep_dive_answers: {
    ...order.deep_dive_answers,
    intakeMeta: { updatedAt: "2026-08-12T12:01:00.000Z" },
  },
}, content), false, "Changed intake must create a new Brand Brain version");
assert.equal(JSON.stringify(content).includes("22AAAAA0000A1Z5"), false, "Billing GSTIN must never enter Brand Brain");
assert.equal(JSON.stringify(content).includes("Private billing address"), false, "Billing address must never enter Brand Brain");

const guardedChoices = buildBrandBrainContentFromAuditIntake({
  ...order,
  deep_dive_answers: {
    ...order.deep_dive_answers,
    businessReach: "online_anywhere",
    location: "Stale location",
    currentMarketing: ["nothing", "social_posting"],
    brandPersonality: ["friendly", "modern", "practical", "luxury"],
  },
});
assert.equal(guardedChoices.location, undefined, "Online-only Brand Brains must not keep a stale location");
assert.deepEqual(guardedChoices.current_marketing, ["nothing"], "Nothing currently must be exclusive");
assert.deepEqual(guardedChoices.brand_personality, ["friendly", "modern", "practical"], "Brand personality must be capped at three");

console.log("brand-brain.test.ts: ALL PASS (structured mapping, existing context preserved, billing excluded)");
