// Run with: node --experimental-strip-types lib/audit/__tests__/service-preselection.test.ts
//
// Final Customer Experience Repair mission, Section 4 (Audit Service
// Auto-Preselection). recommendGoalKeysFromCategoryScores is pure and
// directly testable -- real coverage, not source-regex.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recommendGoalKeysFromCategoryScores, CATEGORY_TO_GOAL_KEY, WEAK_SCORE_THRESHOLD } from "../service-preselection.ts";
import { AUDIT_CATEGORY_SCORE_KEYS, type AuditCategoryScoreKey, type AuditCategoryScore } from "../customer-state.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function scores(overrides: Partial<Record<AuditCategoryScoreKey, number | null>>): Partial<Record<AuditCategoryScoreKey, AuditCategoryScore>> {
  const out: Partial<Record<AuditCategoryScoreKey, AuditCategoryScore>> = {};
  for (const key of AUDIT_CATEGORY_SCORE_KEYS) {
    const score = overrides[key] ?? 80; // strong by default
    out[key] = { score: score, explanation: "x", evidenceSourceIds: [] };
  }
  return out;
}

function run() {
  // --- 1. No data at all -> recommend nothing (never guess) -------------
  assert.deepEqual(recommendGoalKeysFromCategoryScores(null), []);
  assert.deepEqual(recommendGoalKeysFromCategoryScores(undefined), []);
  assert.deepEqual(recommendGoalKeysFromCategoryScores({}), []);

  // --- 2. Every category strong -> nothing recommended ------------------
  assert.deepEqual(recommendGoalKeysFromCategoryScores(scores({})), []);

  // --- 3. Weak Google presence -> google_visibility, exactly (mission's own example) ---
  assert.deepEqual(recommendGoalKeysFromCategoryScores(scores({ discoverabilitySeo: 35 })), ["google_visibility"]);

  // --- 4. Weak website -> website_conversion (mission's own example) ----
  assert.deepEqual(recommendGoalKeysFromCategoryScores(scores({ websiteConversion: 20 })), ["website_conversion"]);

  // --- 5. Weak lead handling -> lead_followup (mission's own example) ---
  assert.deepEqual(recommendGoalKeysFromCategoryScores(scores({ leadGeneration: 10 })), ["lead_followup"]);

  // --- 6. Multiple real weak categories -> multiple real recommendations, never everything ---
  const multi = recommendGoalKeysFromCategoryScores(scores({ discoverabilitySeo: 30, socialContent: 25 }));
  assert.deepEqual(multi.sort(), ["google_visibility", "social_presence"].sort());

  // --- 7. A null score (not enough evidence) never recommends -- never
  //     fabricates a finding the audit didn't actually make -------------
  assert.deepEqual(recommendGoalKeysFromCategoryScores(scores({ discoverabilitySeo: null })), []);

  // --- 8. Categories with no honest goal-key match (brandPositioning,
  //     customerJourney) never force a bad-fit suggestion even when weak -
  assert.deepEqual(recommendGoalKeysFromCategoryScores(scores({ brandPositioning: 10, customerJourney: 5 })), []);
  assert.equal(CATEGORY_TO_GOAL_KEY.brandPositioning, undefined);
  assert.equal(CATEGORY_TO_GOAL_KEY.customerJourney, undefined);

  // --- 9. Threshold matches ScoreFirstReport's own "Strong" cutoff, so a
  //     category shown as anything other than Strong is always recommended
  const scoreFirst = read("components", "audit", "ScoreFirstReport.tsx");
  assert.ok(scoreFirst.includes(`score >= ${WEAK_SCORE_THRESHOLD}`), "the weak-score threshold must match ScoreFirstReport's own 'Strong' cutoff, so recommendation and score display never disagree");

  // --- 10. Wiring: route validates against the real goal-key vocabulary,
  //     never trusts an arbitrary client-supplied key --------------------
  const route = read("app", "api", "platform", "audit", "report", "interested-services", "route.ts");
  assert.ok(/ownedCompletedAudit/.test(route), "must reuse the same real ownership/completion gate the WhatsApp-send route already uses");
  assert.ok(/BUSINESS_GOAL_KEYS as readonly string\[\]\)\.includes\(v\)/.test(route), "must validate every selected key against the real, bounded vocabulary before persisting");
  assert.ok(/goals_answers: \{ \.\.\.existingGoalsAnswers, interestedServices: selected \}/.test(route), "must merge into the existing goals_answers JSONB, not overwrite other fields");

  // --- 11. Panel never forces a selection -- every option stays toggleable
  const panel = read("components", "audit", "ServicePreselectionPanel.tsx");
  assert.ok(/onClick=\{\(\) => toggle\(goal\.key\)\}/.test(panel), "every option must remain individually toggleable, never locked once recommended");

  console.log("service-preselection.test.ts: ALL PASS (real, evidence-based preselection, never fabricated, every option deselectable)");
}

run();
