// Run with: node --experimental-strip-types apps/owner-brain-companion/src/__tests__/queue.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolate the queue file to a throwaway temp dir before importing modules
// that read process.env.APPDATA at call time — never touches the real
// local companion state.
const tmpAppData = fs.mkdtempSync(path.join(os.tmpdir(), "owner-brain-companion-test-"));
process.env.APPDATA = tmpAppData;

const { enqueue, queueDepth } = await import("../queue.ts");

function run() {
  assert.equal(queueDepth(), 0, "a fresh queue must start empty");

  enqueue({ type: "app_session", occurredAt: new Date().toISOString(), appName: "Code.exe", durationSeconds: 30 });
  enqueue({ type: "manual_note", occurredAt: new Date().toISOString(), note: "remember to follow up" });
  assert.equal(queueDepth(), 2, "each enqueue call must durably add exactly one signal");

  // The queue is append-only and file-backed, not in-memory — a fresh
  // process (simulated here by reading the file directly) sees the same
  // signals, which is the actual "offline buffer survives a restart"
  // guarantee.
  const raw = fs.readFileSync(path.join(tmpAppData, "stratxcel-owner-brain-companion", "offline-queue.jsonl"), "utf8");
  const lines = raw.split("\n").filter(Boolean);
  assert.equal(lines.length, 2);
  const first = JSON.parse(lines[0]);
  assert.equal(first.type, "app_session");
  assert.ok(first.id, "every queued signal must get a generated idempotency id");

  fs.rmSync(tmpAppData, { recursive: true, force: true });
  console.log("queue.test.ts (owner-brain-companion): ALL PASS (empty-queue start, durable append, file survives across a fresh read, id assignment)");
}

run();
