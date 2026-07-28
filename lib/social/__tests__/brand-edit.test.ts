// Tests replaceAtIndex — the shared in-place-edit primitive every Brand
// Brain "update" action (products/audiences/pillars/rules/sources) uses,
// since those entities are positions in a JSON array on one owner-scoped
// row rather than rows with their own database id.
// Run with: node --experimental-strip-types lib/social/__tests__/brand-edit.test.ts

import assert from "node:assert/strict";
import { replaceAtIndex } from "../repositories/brand.ts";

interface Item {
  name: string;
  url?: string;
}

function run() {
  const items: Item[] = [{ name: "Alpha", url: "a.com" }, { name: "Beta", url: "b.com" }, { name: "Gamma", url: "c.com" }];

  // Replacing the middle item updates only that item, in place, at the same position.
  const afterEdit = replaceAtIndex(items, 1, { name: "Beta Updated" });
  assert.equal(afterEdit.length, 3, "length must not change");
  assert.equal(afterEdit[0].name, "Alpha", "untouched item before the edited index must be unchanged");
  assert.equal(afterEdit[1].name, "Beta Updated", "the item at the edited index must reflect the patch");
  assert.equal(afterEdit[2].name, "Gamma", "untouched item after the edited index must be unchanged");

  // Partial patch preserves fields not included in it (merge semantics, not replace semantics).
  assert.equal(afterEdit[1].url, "b.com", "fields absent from the patch must be preserved, not dropped");

  // Original array is not mutated — safe to call inside a functional update.
  assert.equal(items[1].name, "Beta", "the original array must not be mutated");
  assert.notEqual(afterEdit, items, "a new array must be returned");

  // Out-of-range index is a safe no-op — never appends, never throws, never corrupts data.
  const outOfRangeHigh = replaceAtIndex(items, 99, { name: "Ghost" });
  assert.deepEqual(outOfRangeHigh, items, "an index past the end must return the array unchanged");
  const outOfRangeLow = replaceAtIndex(items, -1, { name: "Ghost" });
  assert.deepEqual(outOfRangeLow, items, "a negative index must return the array unchanged");

  // Editing the same index twice (as a real edit-then-re-edit flow would) never produces duplicates.
  const editedTwice = replaceAtIndex(replaceAtIndex(items, 0, { name: "First edit" }), 0, { name: "Second edit" });
  assert.equal(editedTwice.length, 3, "repeated edits to the same index must never grow the array");
  assert.equal(editedTwice[0].name, "Second edit");

  console.log("brand-edit.test.ts: ALL PASS (in-place replace, merge semantics, no mutation, out-of-range no-op, repeated edits stay stable)");
}

run();
