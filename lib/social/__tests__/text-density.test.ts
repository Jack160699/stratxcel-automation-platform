import assert from "node:assert/strict";
import { measureTextDensity, evaluateTextDensityGate } from "../text-density.ts";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`text-density.test.ts: ${name} — PASS`);
  } catch (err) {
    console.error(`text-density.test.ts: ${name} — FAIL`);
    throw err;
  }
}

test("zero text elements -> minimal density, gate passes", () => {
  const m = measureTextDensity([]);
  assert.equal(m.density, "minimal");
  assert.equal(m.blockCount, 0);
  assert.equal(evaluateTextDensityGate(m).pass, true);
});

test("one short headline + CTA -> light/moderate density, passes", () => {
  const m = measureTextDensity([
    { role: "headline", text: "The 20-Minute Mobility Fix" },
    { role: "cta", text: "Book a session" },
  ]);
  assert.ok(m.density === "light" || m.density === "moderate");
  assert.equal(evaluateTextDensityGate(m).pass, true);
});

test("headline + long supporting paragraph + CTA + brand label -> heavy/excessive, gate fails", () => {
  const longParagraph = Array(100).fill("word").join(" ");
  const m = measureTextDensity([
    { role: "headline", text: "A very long headline that goes on and on" },
    { role: "supportingLine", text: longParagraph },
    { role: "cta", text: "Contact us today" },
    { role: "brandLabel", text: "Business Name" },
  ]);
  assert.ok(m.density === "heavy" || m.density === "excessive");
  const gate = evaluateTextDensityGate(m);
  assert.equal(gate.pass, false);
  assert.ok(gate.reason);
});

test("more than 4 blocks fails even if each block is short", () => {
  const m = measureTextDensity([
    { role: "headline", text: "Hi" },
    { role: "supportingLine", text: "Ok" },
    { role: "cta", text: "Go" },
    { role: "brandLabel", text: "Biz" },
    { role: "other", text: "Extra" },
  ]);
  const gate = evaluateTextDensityGate(m);
  assert.equal(gate.pass, false);
  assert.ok(gate.reason!.includes("text blocks"));
});

test("intentionallyTextLed bypasses the density gate", () => {
  const longParagraph = Array(50).fill("word").join(" ");
  const m = measureTextDensity([{ role: "headline", text: longParagraph }]);
  assert.equal(evaluateTextDensityGate(m, { intentionallyTextLed: true }).pass, true);
});

test("empty-text elements are excluded from the block count", () => {
  const m = measureTextDensity([
    { role: "headline", text: "Real headline" },
    { role: "supportingLine", text: "   " },
    { role: "cta", text: "" },
  ]);
  assert.equal(m.blockCount, 1);
  assert.equal(m.hasSupportingLine, false);
  assert.equal(m.hasCta, false);
});

console.log("text-density.test.ts: ALL PASS");
