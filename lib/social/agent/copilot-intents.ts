/**
 * Deterministic Social Copilot intents.
 * Model prose is not the authority for preparation / show / publish boundaries.
 * Multilingual support: English, Hindi (Devanagari), Hinglish, Romanized Hindi.
 */

import { isNaturalPublishPhrase } from "../workforce/authorization.ts";

export type SocialCopilotIntent =
  | "PREPARE_WEEK_PLAN"
  | "PREPARE_CONTENT"
  | "SHOW_VARIANTS"
  | "SHOW_CURRENT_REVIEW"
  | "REVISE_CURRENT_ARTIFACT"
  | "POST_NOW_REQUEST"
  | "FUTURE_SCHEDULE_REQUEST"
  | "NATURAL_AFFIRMATION"
  | "GENERAL_CONVERSATION";

const WEEK_PLAN =
  /\b(?:plan(?:\s+(?:this|my|the))?\s+week|prepare(?:\s+(?:this|my|the))?\s+week(?:'s)?(?:\s+(?:posts|content|plan))?|schedule(?:\s+(?:content|posts))?\s+(?:this|for\s+(?:this|the))\s+week|make(?:\s+(?:this|my|the))?\s+week(?:'s)?\s+content(?:\s+plan)?|is\s+hafte(?:\s+ka)?(?:\s+(?:plan|posts?|content))?|hafte\s+ka\s+plan|week\s+ka\s+plan)\b|(?:इस\s*हफ्ते|हफ्ते\s*का\s*प्लान|साप्ताहिक\s*प्लान)/i;

const SHOW_VARIANTS =
  /\b(?:show(?:\s+me)?(?:\s+the)?\s+variants?|show(?:\s+me)?(?:\s+the)?\s+(?:current\s+)?(?:plan|drafts?|posts?)|dikha(?:o|na)?(?:\s+(?:variants?|posts?|drafts?))?|variants?\s+dikha)\b|(?:दिखाओ|ड्राफ्ट्स?\s*दिखाओ|पोस्ट्स?\s*दिखाओ)/i;

const SHOW_REVIEW =
  /\b(?:show(?:\s+me)?(?:\s+the)?\s+(?:current\s+)?review|open(?:\s+the)?\s+review|review\s+(?:card|artifact)|approval\s+(?:card|artifact))\b|(?:रिव्यू\s*दिखाओ|अप्रूवल\s*कार्ड)/i;

const REVISE =
  /\b(?:change|revise|edit|update|replace|shorten|make\s+(?:this|it|the)\s+(?:less|more)|caption\s+(?:ko\s+)?(?:change|badal|hindi|english|hinglish)|image\s+\d+\s+replace|replace\s+image|(?:isko|ise|caption|post)\s+(?:ko\s+)?(?:hindi|english|hinglish|badal|change|edit)|(?:thoda|aur)\s+(?:premium|simple|catchy|chhota|bada|professional|attractive)|badal\s+do|badlo|change\s+karo)\b|(?:बदलो|बदल\s*दो|हिंदी\s*में\s*(?:करो|बनाओ|लिखो)|अंग्रेजी\s*में|प्रीमियम\s*बनाओ|कैप्शन\s*बदलो)/i;

const POST_NOW =
  /\b(?:post(?:\s+it)?\s+now|publish(?:\s+it)?\s+now|post\s+kar\s+do\s+abhi|abhi\s+post|publish\s+immediately|abhi\s+(?:daal|post|publish)\s*(?:do|karo)?|turant\s+post)\b|(?:अभी\s*(?:पोस्ट|डाल|पब्लिश)\s*(?:करो|दो|कर\s*दो)|तुरंत\s*पोस्ट)/i;

const FUTURE_SCHEDULE =
  /\b(?:schedule(?:\s+(?:it|this|for))?(?:\s+(?:tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d))|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:kal|parso|aaj|shaam|subah|dopahar|raat)(?:\s+ko)?(?:\s+(?:post|daal|schedule|publish))?|(?:instagram|facebook|youtube)\s+pe\s+(?:kal|parso|shaam|subah|abhi)|daal\s+do)\b|(?:कल\s*(?:शाम|सुबह|दोपहर|रात)?(?:\s*को)?|परसों|शेड्यूल\s*(?:करो|कर\s*दो))/i;

const PREPARE_CONTENT =
  /\b(?:prepare(?:\s+(?:this|it|content|posts?|drafts?))?|draft(?:\s+(?:this|it|content|posts?))?|create(?:\s+(?:variants?|posts?|content|poster|banner))?|ready\s+(?:kar|karo|kar\s+do)|bana(?:o|na|do|\s+do|\s+dena|iye)?|bna(?:o|do|\s+do)?|bnado|likh(?:o|na|do|\s+do|iye)?|taiyar\s+kar(?:o|na)?)\b|(?:बना\s*दो|बनाओ|बनाएं|लिख\s*दो|लिखो|तैयार\s*करो|पोस्ट\s*बना|पोस्टर\s*बना)/i;

export function classifySocialCopilotIntent(prompt: string): SocialCopilotIntent {
  const value = prompt.trim();
  if (!value) return "GENERAL_CONVERSATION";

  if (WEEK_PLAN.test(value)) return "PREPARE_WEEK_PLAN";
  if (SHOW_VARIANTS.test(value)) return "SHOW_VARIANTS";
  if (SHOW_REVIEW.test(value)) return "SHOW_CURRENT_REVIEW";
  if (REVISE.test(value)) return "REVISE_CURRENT_ARTIFACT";
  if (POST_NOW.test(value)) return "POST_NOW_REQUEST";
  if (FUTURE_SCHEDULE.test(value)) return "FUTURE_SCHEDULE_REQUEST";
  if (PREPARE_CONTENT.test(value)) return "PREPARE_CONTENT";
  if (isNaturalPublishPhrase(value) && value.length < 48) return "NATURAL_AFFIRMATION";
  return "GENERAL_CONVERSATION";
}

/** Week-plan and prepare-content authorize INTERNAL draft creation only. */
export function isSafePreparationIntent(intent: SocialCopilotIntent): boolean {
  return intent === "PREPARE_WEEK_PLAN" || intent === "PREPARE_CONTENT" || intent === "POST_NOW_REQUEST" || intent === "FUTURE_SCHEDULE_REQUEST";
}

export function requiresConcreteFutureSchedule(intent: SocialCopilotIntent): boolean {
  return intent === "PREPARE_WEEK_PLAN" || intent === "FUTURE_SCHEDULE_REQUEST";
}

export function isArtifactDisplayIntent(intent: SocialCopilotIntent): boolean {
  return intent === "SHOW_VARIANTS" || intent === "SHOW_CURRENT_REVIEW" || intent === "NATURAL_AFFIRMATION";
}
