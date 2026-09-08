// Run with: node --experimental-strip-types lib/audit/__tests__/score-first-report.test.ts
//
// Regression guard for Final Customer Experience Repair, Section 1 (Audit
// Report Redesign): a local business owner must understand their audit in
// seconds -- Overall Score, then compact collapsed category cards. Both
// ScoreFirstReport.tsx (a "use client" component; asserted against source,
// same convention as every other client-component test in this build) and
// VisualAuditReport.tsx's wiring of it are covered here.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AUDIT_CATEGORY_SCORE_KEYS } from "../customer-state.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  const scoreFirst = read("components", "audit", "ScoreFirstReport.tsx");
  const visualReport = read("app", "app", "audit", "VisualAuditReport.tsx");

  // --- 1. Every real category the audit engine actually produces is shown,
  //     nothing invented, nothing dropped -------------------------------
  for (const key of AUDIT_CATEGORY_SCORE_KEYS) {
    assert.ok(new RegExp(`"${key}":`).test(scoreFirst) || new RegExp(`${key}:`).test(scoreFirst), `CATEGORY_LABELS/CATEGORY_ORDER must cover the real category "${key}"`);
  }
  assert.equal(
    (scoreFirst.match(/CATEGORY_ORDER: AuditCategoryScoreKey\[\] = \[[\s\S]{0,300}?\];/)?.[0].match(/"/g)?.length ?? 0) / 2,
    AUDIT_CATEGORY_SCORE_KEYS.length,
    "CATEGORY_ORDER must render exactly the real 8 categories, no more, no fewer"
  );

  // --- 2. Collapsed by default -- must not dump the report open --------
  assert.ok(/const \[expanded, setExpanded\] = useState\(false\)/.test(scoreFirst), "each category card must start collapsed");
  assert.ok(/const \[readMore, setReadMore\] = useState\(false\)/.test(scoreFirst), "the deeper explanation must start collapsed too, behind Read more");

  // --- 3. Never fabricates a score or a finding -------------------------
  assert.ok(/score == null/.test(scoreFirst), "a missing category score must be handled as a real absence, not defaulted to a number");
  assert.ok(/Not enough (data|verified data)/i.test(scoreFirst), "a category/overall with no real score must say so honestly");
  // sentenceBullets must split real explanation text, never paraphrase or
  // invent new wording -- confirm it's a pure split, not a template/LLM call.
  assert.ok(/function sentenceBullets\(text: string, limit: number\)/.test(scoreFirst));
  assert.ok(/text\s*\.split\(\/\(\?<=\[\.\!\?\]\)/.test(scoreFirst), "must split on real sentence boundaries in the actual explanation text");

  // --- 4. Wired into the real report, using the real report's own data -
  assert.ok(/import \{ ScoreFirstReport \} from "@\/components\/audit\/ScoreFirstReport"/.test(visualReport));
  assert.ok(/<ScoreFirstReport overallScore=\{score\} confidence=\{confidence\} categoryScores=\{report\.categoryScores\}/.test(visualReport), "must pass the report's own real score/categoryScores, never mock data");

  // --- 5. The long-form existing report is preserved, not deleted -- just
  //     no longer dumped open by default --------------------------------
  assert.ok(/const \[showFullReport, setShowFullReport\] = useState\(false\)/.test(visualReport), "the full technical report must start collapsed");
  assert.ok(/\{showFullReport && \(/.test(visualReport), "sections 3-9 must be gated behind the toggle, not always rendered");
  for (const marker of [
    "EXECUTIVE VERDICT & SEARCH AUTHORITY",
    "ORGANIC SEARCH PERFORMANCE",
    "WHY YOUR COMPETITORS WIN",
    "TOP 5 PRIORITY ACTIONS",
    "YOUR BIGGEST OPPORTUNITY + SERVICE RECOMMENDATION",
  ]) {
    assert.ok(visualReport.includes(marker), `existing report content ("${marker}") must still exist verbatim, only deprioritized -- never deleted`);
  }

  // --- 6. Real fabrication bug fixed alongside this redesign: a hardcoded,
  //     specific-sounding paragraph used to render as if it were the real
  //     executive summary whenever report.executiveSummary was empty. ----
  assert.equal(visualReport.includes("has established foundational domain presence"), false, "must never fabricate a specific-sounding executive summary when the real one is empty");
  assert.ok(/Not enough verified data yet to generate a written executive summary/.test(visualReport), "an empty executive summary must get an honest empty state instead");

  console.log("score-first-report.test.ts: ALL PASS (score-first summary collapsed by default, real 8 categories only, no fabricated scores/findings/summary, existing long-form report preserved but deprioritized)");
}

run();
