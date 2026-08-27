/**
 * Marketing Completeness (Finished Premium Marketing Creative brief
 * Section 20): the real gap this closes is a genuinely beautiful, on-brand
 * photograph that still isn't a FINISHED marketing creative -- most
 * concretely proven by a real bug found via visual inspection: 8 of 14
 * real passing creatives in one benchmark run had `cta.needed=true` with a
 * real, specific CTA the treatment clearly wanted, but the CTA never
 * actually appeared on the rendered image at all (resolveOverlayElements
 * in creative-treatment.ts is the fix; this module is the score that
 * would have caught it automatically).
 *
 * Ten checks from the brief, split by what's honestly automatable:
 *  1. Is the business identifiable?               -- automated (brand label + whyThisBusiness)
 *  2. Is the creative's purpose identifiable?      -- automated (concept/hook non-empty & specific)
 *  4. Is the brand present appropriately?          -- automated (present, not overused)
 *  5. Is the CTA present where required?           -- automated (resolveOverlayElements actually renders it)
 *  6. Is a destination present when needed?        -- automated, soft signal (verified facts referenced)
 *  8. No unfinished-placeholder appearance (text)  -- automated (instruction-leakage gate)
 * Genuinely require looking at the rendered image, same honesty boundary
 * as premium-creative-score.ts's visual dimensions:
 *  3. Is the product/service visually identifiable?
 *  7. Does the creative feel finished?
 *  8b. No visual (not just textual) placeholder appearance.
 *  9. Do the visual and message work together?
 *  10. Could the owner publish this immediately?
 */

import type { CreativeTreatment } from "./creative-treatment.ts";
import { resolveOverlayElements } from "./creative-treatment.ts";
import { findPlaceholderOrFiller } from "./placeholder-detection.ts";

export interface MarketingCompletenessCheck {
  id: string;
  question: string;
  pass: boolean | null; // null = PENDING_VISUAL_INSPECTION
  detail: string;
}

export interface MarketingCompletenessResult {
  checks: MarketingCompletenessCheck[];
  automatedPass: boolean; // true only if every automated (non-null) check passed
  status: "PENDING_VISUAL_INSPECTION" | "COMPLETE";
  /** Set once a human has actually looked at the rendered image. */
  visuallyComplete: boolean | null;
}

/** Automated half -- computable from the treatment/copy alone, no image
 * needed. Real evidence, not a guess: every check here maps to an actual
 * gap found during this campaign's own visual inspections. */
export function assessMarketingCompletenessAutomated(input: {
  treatment: CreativeTreatment;
  businessName: string;
  verifiedFacts: string[];
  caption: string;
}): MarketingCompletenessCheck[] {
  const { treatment, businessName, verifiedFacts, caption } = input;
  const overlayElements = resolveOverlayElements(treatment);
  const checks: MarketingCompletenessCheck[] = [];

  checks.push({
    id: "business_identifiable",
    question: "Is the business identifiable?",
    pass: treatment.whyThisBusiness.trim().length >= 15 && businessName.trim().length > 0,
    detail: treatment.whyThisBusiness.trim().length >= 15
      ? "whyThisBusiness gives a real, specific business-tie; brand label will render."
      : "whyThisBusiness is missing or too generic to actually tie this creative to this business.",
  });

  checks.push({
    id: "purpose_identifiable",
    question: "Is the purpose of the creative identifiable?",
    pass: treatment.concept.trim().length >= 15 && treatment.hook.trim().length >= 8,
    detail: "concept/hook present and specific (structural check -- validateCreativeTreatment already enforces non-genericness).",
  });

  // The compositor (text-overlay-render.ts) always appends its own
  // brandLabel entry but renders via `elements.find(role==="brandLabel")`
  // -- only the FIRST match ever actually draws, so a treatment that
  // already included its own brandLabel can never cause a real duplicate
  // on the rendered image regardless of array length. This check exists
  // to catch a genuine overbranding pattern instead: the business name
  // appearing so many times across the on-image text itself that it reads
  // as a watermark, not the (structurally impossible) duplicate-label case.
  const businessNameMentions = overlayElements.filter(
    (e) => e.role !== "brandLabel" && businessName.trim() && e.text.toLowerCase().includes(businessName.trim().toLowerCase())
  ).length;
  checks.push({
    id: "brand_present_not_overused",
    question: "Is the brand present appropriately (not a giant watermark)?",
    pass: businessNameMentions <= 1,
    detail: businessNameMentions <= 1
      ? "brand label renders once; the business name isn't repeated across other on-image text -- restrained, not overbranded."
      : `the business name appears in ${businessNameMentions} on-image text element(s) beyond the brand label -- reads as overbranded.`,
  });

  const ctaRendered = !treatment.cta.needed || overlayElements.some((e) => e.role === "cta" && e.text.trim());
  checks.push({
    id: "cta_present_when_required",
    question: "Is the CTA present where strategically required?",
    pass: ctaRendered,
    detail: treatment.cta.needed
      ? (ctaRendered ? "cta.needed=true and a real CTA element will actually render." : "cta.needed=true but no CTA element will actually render on the image -- the exact real bug this check exists to catch.")
      : `no CTA needed (${treatment.cta.rationale}) -- not a completeness gap when genuinely intentional.`,
  });

  // Soft signal, not a hard requirement: a CTA implying an off-platform
  // destination (book/call/visit/order) ideally has a real verified
  // location/phone/website nearby to actually act on -- but a valid
  // engagement CTA (comment/save/share) legitimately needs none.
  const destinationImplyingCta = treatment.cta.needed && treatment.cta.text
    ? /\b(book|call|visit|order|enquire|inquire|shop|reserve)\b/i.test(treatment.cta.text)
    : false;
  // verifiedFacts entries are "Label: value" (e.g. "Verified business
  // address (Google Business Profile): 14 Princess Street..." or
  // "Business location (as provided by the owner): Koramangala,
  // Bengaluru") -- checking the LABEL for location/address/website is far
  // more reliable than pattern-matching the free-text value, which can be
  // just a locality name with no digits, URL, or "road"/"street" keyword
  // at all.
  const hasVerifiedDestinationFact = verifiedFacts.some((f) => /location|address|website|phone|whatsapp|contact/i.test(f.split(":")[0] ?? ""));
  const ctaOrCaptionHasUrlOrPhone = /\d{3,}|https?:\/\/|www\.|\.com\b|\.in\b/i.test(`${treatment.cta.text ?? ""} ${caption}`);
  const hasDestinationSignal = hasVerifiedDestinationFact || ctaOrCaptionHasUrlOrPhone;
  checks.push({
    id: "destination_present_when_needed",
    question: "Is a destination/contact mechanism present when conversion requires one?",
    pass: !destinationImplyingCta || hasDestinationSignal,
    detail: destinationImplyingCta
      ? (hasDestinationSignal ? "CTA implies a destination and a real location/contact signal is present in facts/CTA/caption." : "CTA implies visiting/booking/ordering but no location, phone, website, or address signal is present anywhere -- soft completeness gap.")
      : "CTA doesn't imply an off-platform destination (or no CTA needed) -- not applicable.",
  });

  const allTextFields = [
    treatment.concept, treatment.hook, treatment.whyThisBusiness, caption,
    ...overlayElements.map((e) => e.text),
  ];
  const leak = allTextFields.map((t) => findPlaceholderOrFiller(t)).find(Boolean);
  checks.push({
    id: "no_textual_placeholder",
    question: "Does anything look like an unfinished design placeholder (text)?",
    pass: !leak,
    detail: leak ? `implementation-instruction/placeholder text found: "${leak}"` : "no placeholder/instruction-leakage text found in any field that reaches the customer.",
  });

  return checks;
}

/** The four genuinely visual checks -- PENDING until a human supplies real
 * answers from actually looking at the rendered image. Never fabricate
 * these; that defeats the entire point of the boundary. */
export function pendingVisualCompletenessChecks(): MarketingCompletenessCheck[] {
  return [
    { id: "product_visually_identifiable", question: "Is the featured product/service visually identifiable?", pass: null, detail: "PENDING_VISUAL_INSPECTION" },
    { id: "feels_finished", question: "Does the creative feel finished?", pass: null, detail: "PENDING_VISUAL_INSPECTION" },
    { id: "no_visual_placeholder", question: "Does anything look like an unfinished design placeholder (visual)?", pass: null, detail: "PENDING_VISUAL_INSPECTION" },
    { id: "visual_message_alignment", question: "Do the visual and message work together?", pass: null, detail: "PENDING_VISUAL_INSPECTION" },
    { id: "publish_immediately", question: "Could a small-business owner publish this immediately?", pass: null, detail: "PENDING_VISUAL_INSPECTION" },
  ];
}

export function assessMarketingCompleteness(input: {
  treatment: CreativeTreatment;
  businessName: string;
  verifiedFacts: string[];
  caption: string;
}): MarketingCompletenessResult {
  const checks = [...assessMarketingCompletenessAutomated(input), ...pendingVisualCompletenessChecks()];
  const automatedChecks = checks.filter((c) => c.pass !== null);
  return {
    checks,
    automatedPass: automatedChecks.every((c) => c.pass === true),
    status: "PENDING_VISUAL_INSPECTION",
    visuallyComplete: null,
  };
}

/** Merges real visual-inspection answers (never guessed) into a prior
 * result, completing it. */
export function recordVisualCompletenessInspection(
  prior: MarketingCompletenessResult,
  visualAnswers: Record<"product_visually_identifiable" | "feels_finished" | "no_visual_placeholder" | "visual_message_alignment" | "publish_immediately", { pass: boolean; detail: string }>
): MarketingCompletenessResult {
  const checks = prior.checks.map((c) => {
    const answer = (visualAnswers as Record<string, { pass: boolean; detail: string }>)[c.id];
    return answer ? { ...c, pass: answer.pass, detail: answer.detail } : c;
  });
  return {
    checks,
    automatedPass: prior.automatedPass,
    status: "COMPLETE",
    visuallyComplete: checks.every((c) => c.pass === true),
  };
}
