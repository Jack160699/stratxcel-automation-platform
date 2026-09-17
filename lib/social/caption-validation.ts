import { extractPhoneNumbers, formatPhoneNumber } from "./contact-numbers.ts";
import { canonicalContactNumbers, type BusinessContactProfile } from "./business-contact.ts";
import { captionSupportsClickableUrls, type StructuredCta } from "./caption-cta.ts";

/**
 * Pre-publish caption validation, shared by generation (quality gate) and
 * publishing (worker gate). Every rule is tenant-agnostic: contact details are
 * compared with the tenant's canonical profile, never with hardcoded values.
 */

export type CaptionIssueCode =
  | "RAW_URL_IN_CAPTION"
  | "WHATSAPP_LINK_IN_CAPTION"
  | "MALFORMED_URL"
  | "UNKNOWN_CONTACT_NUMBER"
  | "CONFLICTING_CONTACT_NUMBERS"
  | "LINK_IN_BIO_WITHOUT_DESTINATION"
  | "CTA_DESTINATION_MISSING"
  | "TRACKING_PARAMS_MISSING"
  | "ABSOLUTE_CLAIM"
  | "TRANSLITERATION_ERROR";

export interface CaptionIssue {
  code: CaptionIssueCode;
  message: string;
  evidence: string;
}

export interface CaptionValidationInput {
  platform: string;
  caption: string;
  /** The tenant's canonical contact profile; null when there is no tenant context (number checks are skipped). */
  contact: BusinessContactProfile | null;
  /** Text printed on the creative (poster), when known. */
  creativeText?: string | null;
  cta?: StructuredCta | null;
}

export interface CaptionValidationResult {
  ok: boolean;
  issues: CaptionIssue[];
}

const WHATSAPP_LINK = /\b(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\/[^\s)]*/gi;
const HTTP_URL = /\bhttps?:\/\/[^\s)]+/gi;
const WWW_URL = /(?<![@\w.])www\.[^\s)]+/gi;
const BARE_DOMAIN = /(?<![@\w./-])[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|in|net|org|co|io|app|site|info|biz|shop|store)(?:\/[^\s)]*)?(?![\w@])/gi;

function findUrls(text: string): string[] {
  const hits = new Set<string>();
  for (const pattern of [WHATSAPP_LINK, HTTP_URL, WWW_URL, BARE_DOMAIN]) {
    for (const match of text.matchAll(pattern)) hits.add(match[0].replace(/[.,;:!?]+$/, ""));
  }
  // A bare domain inside a full URL is the same link, not a second one.
  return [...hits].filter((hit) => ![...hits].some((other) => other !== hit && other.includes(hit)));
}

function isWellFormedUrl(candidate: string): boolean {
  if (/\s/.test(candidate)) return false;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(candidate) ? candidate : `https://${candidate}`);
    return Boolean(url.hostname && url.hostname.includes("."));
  } catch {
    return false;
  }
}

// Absolute outcome promises about bills/savings. Wording that states a
// definite result ("sirf fixed charges bachte hain", "bill zero ho jayega",
// "25 saal tak free") -- qualified forms ("reduce ho sakta hai") pass.
const ABSOLUTE_CLAIM_PATTERNS: RegExp[] = [
  /\b(?:sirf|bas|only|just)\b[^.!?\n]{0,40}\bfixed\b[^.!?\n]{0,25}\bcharges?\b[^.!?\n]{0,25}\b(?:bachte|bachenge|bachega|rehte|rahenge|remain|left|apply)\b/i,
  /\b(?:bill|bijli bill)\b[^.!?\n]{0,20}\b(?:zero|shunya|maaf|khatam)\b(?![^.!?\n]*\b(?:ho sakta|ho sakti|possible|may|can)\b)/i,
  /\bzero\s+(?:electricity\s+|bijli\s+)?bill\b/i,
  /\b(?:guarantee[ds]?|guaranteed|pakka)\b[^.!?\n]{0,30}\b(?:saving|savings|bachat|bill|return)\b/i,
  /\b100\s?%\s*(?:bill|saving|savings|bachat|maaf|free)\b/i,
  /\b(?:saal|years?)\s+tak\s+(?:free|muft)\b/i,
  /\bfree\s+rah(?:egi|ega|enge)\b/i,
];

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

export function findAbsoluteClaims(text: string): string[] {
  return sentences(text).filter((sentence) => ABSOLUTE_CLAIM_PATTERNS.some((pattern) => pattern.test(sentence)));
}

/** Removes sentences that make absolute outcome claims. Never writes new claims in their place. */
export function removeAbsoluteClaimSentences(text: string): { text: string; removed: string[] } {
  const removed = findAbsoluteClaims(text);
  let out = text;
  for (const sentence of removed) out = out.replace(sentence, "");
  out = out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/ {2,}/g, " ").trim();
  return { text: out, removed };
}

// "chat" written where the roof ("chhat") is meant: followed by a Hindi
// postposition, and not a WhatsApp/live/online chat.
const CHAT_FOR_CHHAT = /(?<!\b(?:whatsapp|live|online|video|group|dm)\s)\bchat\b(?=\s+(?:par|pe|pr|ko|ki|ke|me|mein|se|wali|waali)\b)/gi;

export function findTransliterationErrors(text: string): string[] {
  return [...text.matchAll(CHAT_FOR_CHHAT)].map((match) => text.slice(Math.max(0, (match.index ?? 0) - 20), (match.index ?? 0) + 20).trim());
}

export function applyLanguageQualityFixes(text: string): { text: string; fixes: string[] } {
  const fixes: string[] = [];
  const fixed = text.replace(CHAT_FOR_CHHAT, (word) => {
    const replacement = word === "Chat" ? "Chhat" : word === "CHAT" ? "CHHAT" : "chhat";
    fixes.push(`${word} -> ${replacement}`);
    return replacement;
  });
  return { text: fixed, fixes };
}

export function validateCaptionForPublish(input: CaptionValidationInput): CaptionValidationResult {
  const issues: CaptionIssue[] = [];
  const caption = input.caption ?? "";
  const platform = input.platform.toLowerCase();

  // Links in caption text.
  const urls = findUrls(caption);
  for (const url of urls) {
    if (!isWellFormedUrl(url)) {
      issues.push({ code: "MALFORMED_URL", message: "Caption contains a malformed link", evidence: url });
      continue;
    }
    if (!captionSupportsClickableUrls(platform)) {
      const isWhatsApp = /(?:wa\.me|whatsapp\.com)\//i.test(url);
      issues.push({
        code: isWhatsApp ? "WHATSAPP_LINK_IN_CAPTION" : "RAW_URL_IN_CAPTION",
        message: isWhatsApp
          ? `${platform} captions cannot open WhatsApp links; write "WhatsApp: <number>" instead`
          : `${platform} captions do not make links clickable; use "link in bio" and keep the URL in CTA metadata`,
        evidence: url,
      });
    }
  }

  // "Link in bio" must point at a real destination.
  if (/\blink\s+in\s+(?:the\s+)?bio\b/i.test(caption) && !input.contact?.websiteUrl && !(input.cta?.type === "website" && input.cta.destinationUrl)) {
    issues.push({ code: "LINK_IN_BIO_WITHOUT_DESTINATION", message: 'Caption says "link in bio" but the business has no website destination', evidence: "link in bio" });
  }

  // Structured CTA integrity.
  if (input.cta) {
    if (!input.cta.destinationUrl) {
      issues.push({ code: "CTA_DESTINATION_MISSING", message: `${input.cta.type} CTA has no destination`, evidence: input.cta.displayText });
    }
    if (input.cta.trackingUrl) {
      let params: URLSearchParams | null = null;
      try {
        params = new URL(input.cta.trackingUrl).searchParams;
      } catch {
        issues.push({ code: "MALFORMED_URL", message: "CTA tracking URL is malformed", evidence: input.cta.trackingUrl });
      }
      const missing = params ? ["utm_source", "utm_medium", "utm_campaign"].filter((key) => !params!.get(key)) : [];
      if (missing.length) issues.push({ code: "TRACKING_PARAMS_MISSING", message: `Tracking URL is missing ${missing.join(", ")}`, evidence: input.cta.trackingUrl });
    }
  }

  // Contact consistency across caption, creative and CTA.
  if (input.contact) {
    const canonical = new Set(canonicalContactNumbers(input.contact));
    const sources: Array<[string, string[]]> = [
      ["caption", extractPhoneNumbers(caption)],
      ["creative", extractPhoneNumbers(input.creativeText)],
      ["cta", input.cta?.phoneNumber ? [input.cta.phoneNumber] : []],
    ];
    const allNumbers = new Set<string>();
    for (const [source, numbers] of sources) {
      for (const number of numbers) {
        allNumbers.add(number);
        if (!canonical.has(number)) {
          issues.push({
            code: "UNKNOWN_CONTACT_NUMBER",
            message: canonical.size
              ? `${source} shows a number that is not in the business profile`
              : `${source} shows a number, but the business profile has no phone or WhatsApp number configured`,
            evidence: formatPhoneNumber(number),
          });
        }
      }
    }
    const unknown = [...allNumbers].filter((number) => !canonical.has(number));
    if (allNumbers.size > 1 && unknown.length > 0) {
      issues.push({ code: "CONFLICTING_CONTACT_NUMBERS", message: `${allNumbers.size} different contact numbers appear across caption/creative/CTA`, evidence: [...allNumbers].map(formatPhoneNumber).join(", ") });
    }
  }

  for (const claim of findAbsoluteClaims(caption)) {
    issues.push({ code: "ABSOLUTE_CLAIM", message: "Absolute outcome claim; use qualified wording", evidence: claim });
  }
  for (const evidence of findTransliterationErrors(caption)) {
    issues.push({ code: "TRANSLITERATION_ERROR", message: '"chat" used where "chhat" (roof) is meant', evidence });
  }

  return { ok: issues.length === 0, issues };
}

export function summarizeCaptionIssues(issues: CaptionIssue[]): string {
  return issues.map((issue) => `${issue.code}: ${issue.evidence}`).join("; ");
}
