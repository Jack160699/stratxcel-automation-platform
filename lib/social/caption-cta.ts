import { formatPhoneNumber } from "./contact-numbers.ts";
import type { BusinessContactProfile } from "./business-contact.ts";

/**
 * Structured call-to-action for social copy. What a CTA says (displayText),
 * where it leads (destinationUrl), how that is tracked (trackingUrl) and how
 * it is rendered are separate: a platform whose captions don't make links
 * clickable (Instagram) must never receive a raw URL as CTA text, while the
 * tracking URL stays in structured metadata for bio links, reporting and
 * platforms that do support links in post copy.
 */

export type CtaDestinationType = "website" | "whatsapp" | "call";

interface PlatformLinkPolicy {
  /** Whether URLs typed into the post text become clickable on this platform. */
  clickableUrlsInCaption: boolean;
}

const PLATFORM_LINK_POLICY: Record<string, PlatformLinkPolicy> = {
  instagram: { clickableUrlsInCaption: false },
  facebook: { clickableUrlsInCaption: true },
  threads: { clickableUrlsInCaption: true },
  linkedin: { clickableUrlsInCaption: true },
  youtube: { clickableUrlsInCaption: true },
  x: { clickableUrlsInCaption: true },
};

/** Unknown platforms are treated conservatively: no raw links in copy. */
export function captionSupportsClickableUrls(platform: string): boolean {
  return PLATFORM_LINK_POLICY[platform.toLowerCase()]?.clickableUrlsInCaption ?? false;
}

export interface TrackingParams {
  source: string;
  medium: string;
  campaign: string;
  content?: string;
}

export function buildTrackingUrl(destination: string, params: TrackingParams): string {
  const url = new URL(destination);
  url.searchParams.set("utm_source", params.source);
  url.searchParams.set("utm_medium", params.medium);
  url.searchParams.set("utm_campaign", params.campaign);
  if (params.content) url.searchParams.set("utm_content", params.content);
  return url.toString();
}

export interface StructuredCta {
  type: CtaDestinationType;
  platform: string;
  /** The action wording without any destination, e.g. "Apna plan check karein". */
  leadText: string;
  /** What the rendered caption shows for this platform. */
  displayText: string;
  destinationUrl: string;
  trackingUrl: string | null;
  phoneNumber: string | null;
}

/**
 * Builds a CTA only when its destination genuinely exists in the tenant's
 * canonical contact profile -- never a "link in bio" without a website, never
 * a WhatsApp or call CTA without a configured number. Returns null otherwise.
 */
export function buildStructuredCta(input: {
  platform: string;
  type: CtaDestinationType;
  leadText: string;
  contact: BusinessContactProfile;
  tracking?: TrackingParams | null;
}): StructuredCta | null {
  const platform = input.platform.toLowerCase();
  const lead = input.leadText.trim().replace(/[\s:—-]+$/, "");
  const clickable = captionSupportsClickableUrls(platform);

  if (input.type === "website") {
    if (!input.contact.websiteUrl) return null;
    const trackingUrl = input.tracking ? buildTrackingUrl(input.contact.websiteUrl, input.tracking) : null;
    return {
      type: "website",
      platform,
      leadText: lead,
      displayText: clickable ? `${lead}: ${trackingUrl ?? input.contact.websiteUrl}` : `${lead} — link in bio.`,
      destinationUrl: input.contact.websiteUrl,
      trackingUrl,
      phoneNumber: null,
    };
  }

  const number = input.type === "whatsapp" ? input.contact.whatsappNumber : input.contact.callNumber;
  if (!number) return null;
  const destinationUrl = input.type === "whatsapp" ? `https://wa.me/${number.replace(/\D/g, "")}` : `tel:${number}`;
  return {
    type: input.type,
    platform,
    leadText: lead,
    displayText: input.type === "whatsapp" && clickable ? `${lead}: ${destinationUrl}` : `${lead}: ${formatPhoneNumber(number)}`,
    destinationUrl,
    trackingUrl: null,
    phoneNumber: number,
  };
}

/** First CTA, in preference order, whose destination the tenant actually has. */
export function selectStructuredCta(
  preferences: Array<{ type: CtaDestinationType; leadText: string }>,
  input: { platform: string; contact: BusinessContactProfile; tracking?: TrackingParams | null }
): StructuredCta | null {
  for (const preference of preferences) {
    const cta = buildStructuredCta({ ...input, ...preference });
    if (cta) return cta;
  }
  return null;
}

/**
 * Caption = body, one CTA, a short contact block, optional disclaimer.
 * Hashtags are appended by the publisher. The contact block repeats only
 * configured contact details and never duplicates the CTA's own destination.
 */
export function renderCaption(input: {
  platform: string;
  body: string;
  cta: StructuredCta | null;
  contact: BusinessContactProfile;
  disclaimer?: string | null;
}): string {
  const platform = input.platform.toLowerCase();
  const clickable = captionSupportsClickableUrls(platform);
  const contactLines: string[] = [];
  if (input.contact.businessName) contactLines.push(input.contact.businessName);
  if (input.contact.whatsappNumber && input.cta?.type !== "whatsapp") {
    contactLines.push(`WhatsApp: ${formatPhoneNumber(input.contact.whatsappNumber)}`);
  }
  if (input.contact.callNumber && input.contact.callNumber !== input.contact.whatsappNumber && input.cta?.type !== "call") {
    contactLines.push(`Call: ${formatPhoneNumber(input.contact.callNumber)}`);
  }
  if (clickable && input.contact.websiteUrl && input.cta?.type !== "website") contactLines.push(input.contact.websiteUrl);

  return [input.body.trim(), input.cta?.displayText ?? null, contactLines.length ? contactLines.join("\n") : null, input.disclaimer?.trim() || null]
    .filter((block): block is string => Boolean(block))
    .join("\n\n");
}

/** Prompt rules so generated copy follows the same platform and contact policy the validator enforces. */
export function ctaPromptGuidance(platform: string, contact: BusinessContactProfile | null): string[] {
  const rules: string[] = [];
  if (!captionSupportsClickableUrls(platform)) {
    rules.push("Never put a URL, web address, domain name or wa.me link in the caption -- links are not clickable on this platform.");
    rules.push(contact?.websiteUrl ? 'For a website action, write the action followed by "— link in bio."' : 'Do not write "link in bio": this business has no website configured.');
  }
  if (contact?.whatsappNumber) rules.push(`If the caption mentions WhatsApp, the only WhatsApp number is ${formatPhoneNumber(contact.whatsappNumber)}.`);
  if (contact?.callNumber) rules.push(`If the caption gives a phone number to call, the only number is ${formatPhoneNumber(contact.callNumber)}.`);
  if (!contact?.whatsappNumber && !contact?.callNumber) rules.push("Do not include any phone or WhatsApp number -- none is configured for this business.");
  rules.push("Never promise a zero bill, only-fixed-charges bill, guaranteed saving or 100% outcome; use qualified wording such as \"significantly reduce ho sakta hai\".");
  return rules;
}
