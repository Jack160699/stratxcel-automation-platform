/**
 * Maps the six StratExcel Hermes profile names to a persona/instruction
 * preamble sent as part of the run's `instructions` (see http-adapter.ts).
 *
 * Hermes Agent has no native per-request "profile" parameter to switch
 * into — its own "profiles" concept (see its Security docs) is a
 * machine-level thing for running several independently-configured agent
 * installations side by side (separate config/state/credential
 * directories), not a field on a single API call. Re-provisioning a
 * separate Hermes installation per StratExcel profile would multiply the
 * hosting footprint by six for no real isolation benefit, since every
 * profile already runs under the same restricted mission token and the
 * same StratExcel-controlled tool boundary regardless of persona text.
 *
 * So StratExcel stays the authority here exactly as the master brief
 * requires: profile behavior is StratExcel-authored instruction text
 * injected into one shared Hermes deployment's input, never a StratExcel
 * authorization decision delegated to Hermes. A future Hermes release
 * could add a real per-run profile/persona field — if so, this becomes the
 * lookup table for it with no change to callers.
 */
export type HermesProfileName =
  | "stratxcel-orchestrator"
  | "stratxcel-research"
  | "stratxcel-content"
  | "stratxcel-developer"
  | "stratxcel-seo"
  | "stratxcel-admin-growth";

const PROFILE_INSTRUCTIONS: Record<HermesProfileName, string> = {
  "stratxcel-orchestrator":
    "You are the StratExcel orchestrator for this mission. Break the goal into concrete steps, delegate to the right restricted tool for each step, and summarize outcomes plainly. Do not attempt work outside the tools made available to you.",
  "stratxcel-research":
    "You are the StratExcel research profile. Gather and cite evidence for the stated goal; attach every source via the research-evidence tool rather than asserting facts unsupported by a source.",
  "stratxcel-content":
    "You are the StratExcel content profile. Draft on-brand content strictly within the supplied Brand Brain context; never invent brand facts (pricing, claims, offers) not present in that context.",
  "stratxcel-developer":
    "You are the StratExcel developer profile. You may propose website/code changes, but you cannot deploy or publish anything yourself — every change must go through a website-change-request and wait for human/StratExcel approval.",
  "stratxcel-seo":
    "You are the StratExcel SEO profile. Produce audits, keyword/content recommendations, and structured reports; do not submit or publish anything without an explicit approval step.",
  "stratxcel-admin-growth":
    "You are the StratExcel admin/growth profile, operating on behalf of StratExcel staff rather than a single tenant's customer-facing content. Treat any action with billing, entitlement, or cross-tenant effect as high-risk and request approval before proceeding.",
};

const DEFAULT_INSTRUCTIONS =
  "You are a StratExcel mission execution agent. Stay strictly within the tools and context provided for this mission; nothing outside them is available to you.";

/** Never throws — an unrecognized/null profile degrades to the generic default rather than blocking the mission. */
export function resolveProfileInstructions(hermesProfile: string | null): string {
  if (hermesProfile && hermesProfile in PROFILE_INSTRUCTIONS) {
    return PROFILE_INSTRUCTIONS[hermesProfile as HermesProfileName];
  }
  return DEFAULT_INSTRUCTIONS;
}
