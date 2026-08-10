// Tests the Copilot session-rail date grouping (Section 2 of the workspace
// repair brief): TODAY/YESTERDAY/THIS WEEK/OLDER buckets, and which groups
// open by default vs. stay collapsed unless they hold the active session.
// Run with: node --experimental-strip-types lib/social/__tests__/copilot-session-groups.test.ts

import assert from "node:assert/strict";
import { groupSessionsByRecency, defaultOpenGroups, DEFAULT_OPEN_GROUPS } from "../../../app/admin/social/copilot/session-groups.ts";

function session(id: string, updatedAt: string) {
  return { id, owner_id: "owner", title: id, status: "READY", context: {}, created_at: updatedAt, updated_at: updatedAt } as const;
}

function run() {
  const now = new Date("2026-08-10T12:00:00.000Z");
  const sessions = [
    session("today-1", "2026-08-10T09:00:00.000Z"),
    session("yesterday-1", "2026-08-09T09:00:00.000Z"),
    session("this-week-1", "2026-08-06T09:00:00.000Z"),
    session("older-1", "2026-07-01T09:00:00.000Z"),
  ];

  const groups = groupSessionsByRecency(sessions, now);
  assert.deepEqual(groups.map((group) => group.label), ["Today", "Yesterday", "This week", "Older"]);
  assert.equal(groups[0].sessions[0].id, "today-1");
  assert.equal(groups[1].sessions[0].id, "yesterday-1");
  assert.equal(groups[2].sessions[0].id, "this-week-1");
  assert.equal(groups[3].sessions[0].id, "older-1");

  // Empty groups are omitted rather than rendered as empty accordions.
  const onlyToday = groupSessionsByRecency([session("today-1", "2026-08-10T09:00:00.000Z")], now);
  assert.deepEqual(onlyToday.map((group) => group.label), ["Today"]);

  // Exactly 7 days back still counts as "this week", not "older".
  const boundary = groupSessionsByRecency([session("boundary", "2026-08-03T12:00:00.000Z")], now);
  assert.equal(boundary[0].label, "This week");

  // Default open state: TODAY only, unless the active session lives elsewhere.
  assert.deepEqual([...defaultOpenGroups(groups, null)].sort(), [...DEFAULT_OPEN_GROUPS].sort());
  assert.ok(defaultOpenGroups(groups, "today-1").has("Today"));
  assert.ok(!defaultOpenGroups(groups, "today-1").has("Yesterday"));
  // Active session inside a normally-collapsed group forces that group open too.
  const withOlderActive = defaultOpenGroups(groups, "older-1");
  assert.ok(withOlderActive.has("Today") && withOlderActive.has("Older"));
  assert.ok(!withOlderActive.has("Yesterday") && !withOlderActive.has("This week"));

  console.log("copilot-session-groups.test.ts: ALL PASS (Today/Yesterday/This week/Older buckets, active-session auto-open)");
}

run();
