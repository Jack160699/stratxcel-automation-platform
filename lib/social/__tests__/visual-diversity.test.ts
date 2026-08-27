import assert from "node:assert/strict";
import { visualFingerprintFromTreatment, checkVisualRepetition } from "../content-diversity.ts";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`visual-diversity.test.ts: ${name} — PASS`);
  } catch (err) {
    console.error(`visual-diversity.test.ts: ${name} — FAIL`);
    throw err;
  }
}

test("near-identical composition/subject/camera flags as duplicate even with different captions", () => {
  const a = visualFingerprintFromTreatment({
    subject: "trainer correcting client's deadlift form",
    composition: "subject-centered, low angle for power",
    camera: "35mm documentary feel, eye level",
    environment: "dark industrial gym floor",
  });
  const b = visualFingerprintFromTreatment({
    subject: "trainer correcting client's deadlift form",
    composition: "subject-centered, low angle for power",
    camera: "35mm documentary feel, eye level",
    environment: "dark industrial gym floor",
  });
  const check = checkVisualRepetition(a, [b]);
  assert.equal(check.isDuplicate, true);
});

test("genuinely different composition/subject does not flag", () => {
  const a = visualFingerprintFromTreatment({
    subject: "kettlebell squat mid-rep with battle ropes in background",
    composition: "dynamic three-quarter angle, motion blur on ropes",
    camera: "wide 24mm, low angle",
    environment: "bright gym floor with red accent lighting",
  });
  const b = visualFingerprintFromTreatment({
    subject: "coach spotting a client's deadlift, tight two-shot",
    composition: "subject-centered, eye level",
    camera: "50mm, shallow depth of field",
    environment: "dark industrial gym corner",
  });
  const check = checkVisualRepetition(a, [b]);
  assert.equal(check.isDuplicate, false);
});

test("empty recent history never flags a duplicate", () => {
  const a = visualFingerprintFromTreatment({ subject: "x", composition: "y", camera: "z", environment: "w" });
  assert.equal(checkVisualRepetition(a, []).isDuplicate, false);
});

console.log("visual-diversity.test.ts: ALL PASS");
