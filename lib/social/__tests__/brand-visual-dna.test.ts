import assert from "node:assert/strict";
import { deriveBrandVisualDNA, summarizeBrandVisualDNA } from "../brand-visual-dna.ts";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`brand-visual-dna.test.ts: ${name} — PASS`);
  } catch (err) {
    console.error(`brand-visual-dna.test.ts: ${name} — FAIL`);
    throw err;
  }
}

test("warm orange primary color reads as warm temperature", () => {
  const dna = deriveBrandVisualDNA({ brandColors: ["#F4A300", "#1E5631"], brandTone: [], industryCategory: "restaurant" });
  assert.equal(dna.colorTemperature, "warm");
  assert.equal(dna.primaryColor, "#F4A300");
});

test("cool blue primary color reads as cool temperature", () => {
  const dna = deriveBrandVisualDNA({ brandColors: ["#1E5AA8"], brandTone: [], industryCategory: "clinic" });
  assert.equal(dna.colorTemperature, "cool");
});

test("no saved colors -> neutral defaults, basis explains why", () => {
  const dna = deriveBrandVisualDNA({ brandColors: [], brandTone: [], industryCategory: "generic" });
  assert.equal(dna.primaryColor, null);
  assert.equal(dna.colorTemperature, "neutral");
  assert.ok(dna.basis.some((b) => b.includes("no valid saved brand color")));
});

test("brand tone words drive typography over industry default when they match", () => {
  const dna = deriveBrandVisualDNA({ brandColors: [], brandTone: ["confident", "trend-forward"], industryCategory: "restaurant" });
  assert.equal(dna.typographyPersonality, "confident-display"); // "confident" matches -> overrides the restaurant (warm-humanist) default
});

test("positioning falls back to industry default when tone words don't map to a positioning bucket", () => {
  const dna = deriveBrandVisualDNA({ brandColors: [], brandTone: ["confident", "trend-forward"], industryCategory: "salon" });
  assert.equal(dna.positioningArchetype, "luxury"); // salon industry default -- neither tone word maps to a positioning bucket
});

test("brand tone words drive positioning when they do map", () => {
  const dna = deriveBrandVisualDNA({ brandColors: [], brandTone: ["energetic", "gritty"], industryCategory: "salon" });
  assert.equal(dna.positioningArchetype, "energetic"); // tone override beats the salon (luxury) default
});

test("no tone signal -> falls back to industry default, basis says so", () => {
  const dna = deriveBrandVisualDNA({ brandColors: [], brandTone: ["zesty"], industryCategory: "gym" });
  assert.equal(dna.typographyPersonality, "bold-condensed"); // gym fallback
  assert.ok(dna.basis.some((b) => b.includes("fell back to the gym industry default")));
});

test("two colors with a big lightness delta -> high contrast", () => {
  const dna = deriveBrandVisualDNA({ brandColors: ["#111111", "#F5F5F5"], brandTone: [], industryCategory: "salon" });
  assert.equal(dna.contrastLevel, "high");
});

test("summarizeBrandVisualDNA produces a compact non-empty single line", () => {
  const dna = deriveBrandVisualDNA({ brandColors: ["#B76E79", "#111111"], brandTone: ["confident"], industryCategory: "salon" });
  const summary = summarizeBrandVisualDNA(dna);
  assert.ok(summary.length > 20);
  assert.ok(!summary.includes("\n"));
});

console.log("brand-visual-dna.test.ts: ALL PASS");
