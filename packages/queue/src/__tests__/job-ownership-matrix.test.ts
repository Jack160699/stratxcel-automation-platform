// Run with: node --experimental-strip-types packages/queue/src/__tests__/job-ownership-matrix.test.ts
//
// Static cross-worker check proving the ownership contract in
// docs/architecture/JOB_OWNERSHIP_MATRIX.md actually holds in source: no two
// of the three long-running processes (mission-worker, whatsapp-worker,
// hermes-gateway) that share the same `queue_jobs` table claim overlapping
// job types. This is exactly the class of defect that let mission-worker
// silently race the Vercel audit cron for `audit.generate_v1` for days.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const readCode = (...parts: string[]) =>
  fs
    .readFileSync(path.join(root, ...parts), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

function run() {
  const missionWorkerSrc = readCode("apps", "mission-worker", "src", "worker.ts");
  const whatsappProcessorSrc = readCode("apps", "whatsapp-worker", "src", "processor.ts");
  const hermesGatewaySrc = readCode("apps", "hermes-gateway", "src", "server.ts");

  // --- 1. hermes-gateway must never poll queue_jobs at all — it's a ----
  //        passive inbound tool server, not a queue consumer ------------
  assert.doesNotMatch(hermesGatewaySrc, /claimNext\s*\(/, "hermes-gateway must not claim queue_jobs rows");
  assert.doesNotMatch(hermesGatewaySrc, /createPostgresQueueAdapter\s*\(/, "hermes-gateway must not construct a queue adapter for claiming work");

  // --- 2. mission-worker's active claim list must contain mission.execute
  //        and must NOT contain the audit or WhatsApp job types ----------
  const missionJobTypesLine = missionWorkerSrc.match(/const jobTypes = [^;]+;/)?.[0] ?? "";
  assert.ok(missionJobTypesLine.length > 0, "must find mission-worker's jobTypes assignment");
  assert.match(missionJobTypesLine, /MISSION_JOB_TYPE/, "mission-worker must claim MISSION_JOB_TYPE");
  assert.doesNotMatch(
    missionJobTypesLine,
    /AUDIT_GENERATION_JOB_TYPE/,
    "mission-worker must never claim AUDIT_GENERATION_JOB_TYPE — that is the Vercel cron's exclusive job type",
  );
  assert.doesNotMatch(
    missionJobTypesLine,
    /whatsapp\.process_inbound|WHATSAPP.*JOB_TYPE/i,
    "mission-worker must never claim WhatsApp's job type",
  );

  // --- 3. whatsapp-worker's processor must claim only its own job type --
  const whatsappClaimLine = whatsappProcessorSrc.match(/claimNext\(\{[^}]+\}\)/)?.[0] ?? "";
  assert.ok(whatsappClaimLine.length > 0, "must find whatsapp-worker processor's claimNext call");
  assert.match(whatsappClaimLine, /JOB_TYPE/, "whatsapp-worker processor must claim its own JOB_TYPE constant");
  assert.match(whatsappProcessorSrc, /JOB_TYPE\s*=\s*"whatsapp\.process_inbound"/, "whatsapp-worker's job type must be whatsapp.process_inbound");
  assert.doesNotMatch(whatsappClaimLine, /MISSION_JOB_TYPE|AUDIT_GENERATION_JOB_TYPE/, "whatsapp-worker must never claim mission or audit job types");

  // --- 4. The three canonical job type string literals must all be -----
  //        mutually distinct — a typo making two collide would silently
  //        recreate the exact race this file exists to prevent -----------
  const jobTypeLiterals = new Set<string>();
  for (const [src, pattern] of [
    [missionWorkerSrc, /MISSION_JOB_TYPE\s*=\s*"([^"]+)"/],
    [whatsappProcessorSrc, /JOB_TYPE\s*=\s*"([^"]+)"/],
  ] as const) {
    const match = src.match(pattern);
    assert.ok(match, `could not find job-type literal for pattern ${pattern}`);
    jobTypeLiterals.add(match![1]);
  }
  // AUDIT_GENERATION_JOB_TYPE is defined in @stratxcel/audit-engine, not
  // re-declared as a literal in worker.ts (it's imported) — assert the
  // import exists and record the known literal value directly.
  assert.match(missionWorkerSrc, /AUDIT_GENERATION_JOB_TYPE/, "mission-worker must import AUDIT_GENERATION_JOB_TYPE (for the dormant handling branch)");
  jobTypeLiterals.add("audit.generate_v1");
  assert.equal(jobTypeLiterals.size, 3, "all three job type literals must be mutually distinct");

  console.log("✓ hermes-gateway never polls queue_jobs (passive tool server only)");
  console.log("✓ mission-worker claims mission.execute only — not audit.generate_v1, not whatsapp.process_inbound");
  console.log("✓ whatsapp-worker's processor claims whatsapp.process_inbound only");
  console.log("✓ all three job type literals are mutually distinct");
  console.log("\n=================================================================");
  console.log("JOB OWNERSHIP MATRIX TEST PASSED — NO ACCIDENTAL WORKER OVERLAP!");
  console.log("=================================================================");
}

run();
