// Platform-aware CTA rendering, contact consistency and caption quality gates.
// Run with: node --experimental-strip-types lib/social/__tests__/caption-cta-validation.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBusinessContact, type BusinessContactProfile } from "../business-contact.ts";
import { buildStructuredCta, renderCaption, selectStructuredCta, ctaPromptGuidance } from "../caption-cta.ts";
import { applyLanguageQualityFixes, removeAbsoluteClaimSentences, validateCaptionForPublish } from "../caption-validation.ts";
import { extractPhoneNumbers, normalizePhoneNumber } from "../contact-numbers.ts";
import { scoreGeneratedContent } from "../quality-score.ts";

console.log("Running caption CTA + validation tests...\n");

// A fictional tenant: every value comes from its Brand Brain content, nothing is hardcoded in the code under test.
const CONTACT: BusinessContactProfile = resolveBusinessContact({
  business_name: "Example Rooftop Energy",
  website_url: "https://www.example-energy.in",
  business_phone: "+91 98250 11111",
  business_whatsapp: "98250 22222",
});
const TRACKING = { source: "instagram", medium: "social", campaign: "spring_campaign", content: "post-01" };
const codes = (result: { issues: Array<{ code: string }> }) => result.issues.map((i) => i.code);

// Contact resolution and phone normalization.
{
  assert.equal(CONTACT.callNumber, "+919825011111");
  assert.equal(CONTACT.whatsappNumber, "+919825022222");
  assert.equal(normalizePhoneNumber("09825011111"), "+919825011111");
  assert.deepEqual(new Set(extractPhoneNumbers("Call 98250 11111 or wa.me/919825022222; price ₹3,05,000 in 2026")), new Set(["+919825011111", "+919825022222"]), "prices and years are not phone numbers");
  assert.equal(resolveBusinessContact({ business_phone: "98250 11111" }).whatsappNumber, "+919825011111", "WhatsApp falls back to the business phone");
  console.log("  ok  contact profile resolved from Brand Brain fields only");
}

// TEST 1 + TEST 8: Instagram website CTA -> "link in bio", no raw URL.
{
  const cta = buildStructuredCta({ platform: "instagram", type: "website", leadText: "Apna plan check karein", contact: CONTACT, tracking: TRACKING })!;
  assert.equal(cta.displayText, "Apna plan check karein — link in bio.");
  const caption = renderCaption({ platform: "instagram", body: "Roof par solar ka sahi size.", cta, contact: CONTACT });
  assert.ok(!/https?:\/\/|www\.|\.in\b/.test(caption), "no URL or domain in an Instagram caption");
  assert.ok(caption.includes("link in bio"));
  assert.equal(validateCaptionForPublish({ platform: "instagram", caption, contact: CONTACT, cta }).ok, true);
  console.log("  ok  TEST 1/8: Instagram website CTA renders 'link in bio' with no raw URL");
}

// TEST 2: Instagram WhatsApp CTA -> number, never wa.me.
{
  const cta = buildStructuredCta({ platform: "instagram", type: "whatsapp", leadText: "WhatsApp par apna bill bhejein", contact: CONTACT })!;
  assert.equal(cta.displayText, "WhatsApp par apna bill bhejein: +91 98250 22222");
  assert.equal(cta.destinationUrl, "https://wa.me/919825022222", "the wa.me destination stays in structured metadata");
  const caption = renderCaption({ platform: "instagram", body: "Bill dekh kar tension?", cta, contact: CONTACT });
  assert.ok(!caption.includes("wa.me"));
  assert.equal(validateCaptionForPublish({ platform: "instagram", caption, contact: CONTACT, cta }).ok, true);

  const raw = validateCaptionForPublish({ platform: "instagram", caption: "Bill bhejein: https://wa.me/919825022222", contact: CONTACT });
  assert.ok(codes(raw).includes("WHATSAPP_LINK_IN_CAPTION"));
  console.log("  ok  TEST 2: Instagram WhatsApp CTA shows the number; raw wa.me fails validation");
}

// TEST 3 + TEST 12: UTM tracking kept in metadata, caption stays clean.
{
  const cta = buildStructuredCta({ platform: "instagram", type: "website", leadText: "Plan check karein", contact: CONTACT, tracking: TRACKING })!;
  const tracking = new URL(cta.trackingUrl!);
  assert.equal(tracking.searchParams.get("utm_source"), "instagram");
  assert.equal(tracking.searchParams.get("utm_campaign"), "spring_campaign");
  assert.equal(tracking.searchParams.get("utm_content"), "post-01");
  assert.equal(cta.destinationUrl, "https://www.example-energy.in/");
  const caption = renderCaption({ platform: "instagram", body: "Body.", cta, contact: CONTACT });
  assert.ok(!caption.includes("utm_"), "tracking parameters never reach the Instagram caption");

  const rawUtm = validateCaptionForPublish({ platform: "instagram", caption: `Check: ${cta.trackingUrl}`, contact: CONTACT });
  assert.ok(codes(rawUtm).includes("RAW_URL_IN_CAPTION"));
  const broken = validateCaptionForPublish({ platform: "instagram", caption, contact: CONTACT, cta: { ...cta, trackingUrl: "https://www.example-energy.in/?utm_source=instagram" } });
  assert.ok(codes(broken).includes("TRACKING_PARAMS_MISSING"));
  console.log("  ok  TEST 3/12: tracking URL retained in metadata; caption clean; broken UTM caught");
}

// TEST 4 + TEST 5 + TEST 11: contact consistency.
{
  const wrong = validateCaptionForPublish({ platform: "instagram", caption: "Call karein: +91 77777 00000", contact: CONTACT });
  assert.ok(codes(wrong).includes("UNKNOWN_CONTACT_NUMBER"), "a number not in the business profile fails");

  const canonical = validateCaptionForPublish({ platform: "instagram", caption: "Call karein: +91 98250 11111\nWhatsApp: +91 98250 22222", contact: CONTACT });
  assert.equal(canonical.ok, true, "configured call + WhatsApp numbers pass");

  const three = validateCaptionForPublish({
    platform: "instagram",
    caption: "Call: +91 98250 11111",
    creativeText: "WhatsApp +91 95555 12345 | Direct: +91 77777 00000",
    contact: CONTACT,
  });
  assert.ok(codes(three).includes("CONFLICTING_CONTACT_NUMBERS"));
  assert.ok(codes(three).filter((c) => c === "UNKNOWN_CONTACT_NUMBER").length >= 2, "numbers printed on the creative are checked too");

  const noProfile = validateCaptionForPublish({ platform: "instagram", caption: "Call: +91 98250 11111", contact: resolveBusinessContact({ website_url: "https://x.in" }) });
  assert.ok(codes(noProfile).includes("UNKNOWN_CONTACT_NUMBER"), "a tenant with no configured number cannot show any number");
  console.log("  ok  TEST 4/5/11: unknown or conflicting numbers fail; canonical numbers pass");
}

// TEST 6: "chat" where "chhat" is meant.
{
  const typo = validateCaptionForPublish({ platform: "instagram", caption: "Aapki chat par aane wali dhoop se bijli banao.", contact: null });
  assert.ok(codes(typo).includes("TRANSLITERATION_ERROR"));
  assert.equal(applyLanguageQualityFixes("Aapki chat par aane wali dhoop").text, "Aapki chhat par aane wali dhoop");
  assert.equal(validateCaptionForPublish({ platform: "instagram", caption: "WhatsApp chat par bill bhejein", contact: null }).ok, true, "a WhatsApp chat is not a roof");
  console.log("  ok  TEST 6: chat -> chhat detected and fixed; WhatsApp chat untouched");
}

// TEST 7: platforms with clickable links render real URLs.
{
  const fb = buildStructuredCta({ platform: "facebook", type: "website", leadText: "Plan check karein", contact: CONTACT, tracking: TRACKING })!;
  assert.ok(fb.displayText.startsWith("Plan check karein: https://www.example-energy.in/?utm_source=instagram"));
  const fbCaption = renderCaption({ platform: "facebook", body: "Body.", cta: fb, contact: CONTACT });
  assert.equal(validateCaptionForPublish({ platform: "facebook", caption: fbCaption, contact: CONTACT, cta: fb }).ok, true, "a URL in a Facebook post is valid");
  const fbWa = buildStructuredCta({ platform: "facebook", type: "whatsapp", leadText: "WhatsApp karein", contact: CONTACT })!;
  assert.ok(fbWa.displayText.endsWith("https://wa.me/919825022222"));
  assert.ok(codes(validateCaptionForPublish({ platform: "facebook", caption: "Visit https://exa mple.in", contact: null })).includes("MALFORMED_URL"), "a broken link is malformed on every platform");
  console.log("  ok  TEST 7: Facebook renders clickable URLs; Instagram rules are not applied to it");
}

// TEST 9 + TEST 10: no fake destinations.
{
  const noWebsite = resolveBusinessContact({ business_name: "No Site Shop", business_phone: "98250 11111" });
  assert.equal(buildStructuredCta({ platform: "instagram", type: "website", leadText: "Plan dekhein", contact: noWebsite }), null, "no website -> no website CTA");
  const fallback = selectStructuredCta([{ type: "website", leadText: "Plan dekhein" }, { type: "call", leadText: "Call karein" }], { platform: "instagram", contact: noWebsite });
  assert.equal(fallback?.type, "call");
  assert.ok(codes(validateCaptionForPublish({ platform: "instagram", caption: "Details — link in bio.", contact: noWebsite })).includes("LINK_IN_BIO_WITHOUT_DESTINATION"));

  const noNumbers = resolveBusinessContact({ business_name: "Site Only", website_url: "https://site-only.in" });
  assert.equal(buildStructuredCta({ platform: "instagram", type: "whatsapp", leadText: "WhatsApp karein", contact: noNumbers }), null, "no number -> no WhatsApp CTA, never an invented one");
  const rendered = renderCaption({ platform: "instagram", body: "Body.", cta: null, contact: noNumbers });
  assert.equal(extractPhoneNumbers(rendered).length, 0);
  assert.ok(ctaPromptGuidance("instagram", noNumbers).some((rule) => rule.includes("Do not include any phone")));
  console.log("  ok  TEST 9/10: no 'link in bio' without a website; no invented WhatsApp number");
}

// Absolute claims.
{
  const absolute = validateCaptionForPublish({ platform: "instagram", caption: "Raat ko units adjust hote hain. Bas standard fixed meter charges bachte hain.", contact: null });
  assert.ok(codes(absolute).includes("ABSOLUTE_CLAIM"));
  const cleaned = removeAbsoluteClaimSentences("Net metering se bill kam hota hai. Bas standard fixed meter charges bachte hain.\n\nHonest calculation ke liye:");
  assert.deepEqual(cleaned.removed, ["Bas standard fixed meter charges bachte hain."]);
  assert.ok(!cleaned.text.includes("fixed meter charges"));
  for (const claim of ["Bill zero ho jayega.", "Guaranteed saving har mahine.", "100% bill maaf.", "Bijli 25 saal tak free rahegi."]) {
    assert.ok(codes(validateCaptionForPublish({ platform: "instagram", caption: claim, contact: null })).includes("ABSOLUTE_CLAIM"), claim);
  }
  assert.equal(validateCaptionForPublish({ platform: "instagram", caption: "Bill significantly reduce ho sakta hai*.", contact: null }).ok, true);
  console.log("  ok  absolute claims detected; qualified wording passes");
}

// Quality gate: the canonical generation pipeline rejects the same problems before publish.
{
  const base = { title: "Solar", hashtags: ["solar"], businessName: "Example Rooftop Energy", contentPillar: "education", concept: "net metering", industry: "generic" as never, verifiedFacts: [], objective: "LEADS" as never };
  const failed = scoreGeneratedContent({ ...base, caption: "Book a free survey today at https://www.example-energy.in and call +91 77777 00000.", platform: "instagram", contact: CONTACT });
  const reasons = failed.hardFailures.map((f) => f.reason);
  assert.ok(reasons.includes("INVALID_CTA_LINK") && reasons.includes("CONTACT_MISMATCH"));
  const unchanged = scoreGeneratedContent({ ...base, caption: "Book a free survey today at https://www.example-energy.in and call +91 77777 00000." });
  assert.ok(!unchanged.hardFailures.some((f) => f.reason === "INVALID_CTA_LINK"), "callers that don't pass a platform keep their previous behaviour");
  console.log("  ok  quality gate enforces link/contact rules when platform + contact are supplied");
}

// Wiring: publisher gate and autopilot generation use the shared validator.
{
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const worker = strip(fs.readFileSync(path.join(here, "..", "worker.ts"), "utf8"));
  const gate = worker.search(/await assertCaptionPublishable\(service, account, variant, caption\)/);
  const publish = worker.search(/provider\.publish\(\{/);
  assert.ok(gate > 0 && publish > gate, "worker validates the caption before calling the provider");
  assert.match(worker, /err instanceof PrePublishValidationError \|\|/, "a validation failure is never retried");
  const autopilot = strip(fs.readFileSync(path.join(here, "..", "package-autopilot.ts"), "utf8"));
  assert.match(autopilot, /ctaPromptGuidance\(platform, businessContactBatch\)/);
  assert.match(autopilot, /contact: businessContactBatch,/);
  assert.ok(!/durgsolar|95847|77778|9584735857|7777812777/i.test(fs.readFileSync(path.join(here, "..", "caption-cta.ts"), "utf8") + fs.readFileSync(path.join(here, "..", "caption-validation.ts"), "utf8") + fs.readFileSync(path.join(here, "..", "business-contact.ts"), "utf8")), "no tenant contact data hardcoded in generic code");
  console.log("  ok  worker gate before publish; autopilot prompt + quality gate use the tenant contact profile");
}

console.log("\nALL CAPTION CTA + VALIDATION TESTS PASSED\n");
