/**
 * Hero outcome phrases, in plain business English.
 *
 * Every phrase maps to one area of the single Stratxcel workspace shown behind
 * the headline, so the camera moves left-to-right across one connected
 * environment instead of cutting between unrelated scenes. `unified` is the
 * pull-back state where the whole workspace is visible at once.
 */

export type HeroSceneKey =
  | "grow"
  | "market"
  | "sell"
  | "automate"
  | "scale"
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
  { text: "GROW.", scene: "grow" },
  { text: "MARKET.", scene: "market" },
  { text: "SELL.", scene: "sell" },
  { text: "AUTOMATE.", scene: "automate" },
  { text: "SCALE.", scene: "scale" },
];

/** Static fallback when motion is reduced — the strongest universal outcome. */
export const HERO_PHRASE_REDUCED_MOTION = HERO_PHRASES[0]!;

export const HERO_PHRASE_INTERVAL_MS = 3200;
