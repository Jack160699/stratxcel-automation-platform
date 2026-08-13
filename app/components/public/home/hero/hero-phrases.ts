/**
 * Hero outcome phrases, in plain business English.
 *
 * Every phrase maps to one area of the single Stratxcel workspace shown behind
 * the headline, so the camera moves left-to-right across one connected
 * environment instead of cutting between unrelated scenes. `unified` is the
 * pull-back state where the whole workspace is visible at once.
 */

export type HeroSceneKey =
  | "search"
  | "social"
  | "content"
  | "leads"
  | "whatsapp"
  | "website"
  | "workflow"
  | "analytics"
  | "unified";

export type HeroPhrase = {
  text: string;
  scene: HeroSceneKey;
};

export const HERO_PHRASES: HeroPhrase[] = [
  { text: "get found on Google.", scene: "search" },
  { text: "grow on social.", scene: "social" },
  { text: "create better content.", scene: "content" },
  { text: "find more customers.", scene: "leads" },
  { text: "follow up faster.", scene: "whatsapp" },
  { text: "improve your website.", scene: "website" },
  { text: "automate daily work.", scene: "workflow" },
  { text: "understand what works.", scene: "analytics" },
  { text: "grow your business.", scene: "unified" },
];

/** Static fallback when motion is reduced — the strongest universal outcome. */
export const HERO_PHRASE_REDUCED_MOTION = HERO_PHRASES[HERO_PHRASES.length - 1]!;

export const HERO_PHRASE_INTERVAL_MS = 3600;
