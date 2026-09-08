// Run with: node --experimental-strip-types app/app/content/__tests__/content-simplification.test.ts
//
// Final Customer Experience Repair mission, Section 5/26 (Content Section
// Simplification). ContentLibraryClient.tsx is a "use client" component --
// asserted against source, same convention as every other client-component
// test in this build.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  const client = read("app", "app", "content", "ContentLibraryClient.tsx");

  // --- 1. "Connect Accounts" was a genuinely missing main action -- there
  //     was no path from Content into the connectors flow at all before. --
  assert.ok(/href="\/app\/integrations"[\s\S]{0,400}Connect Accounts/.test(client), "Connect Accounts must link into the real connectors flow");

  // --- 2. The 3 free branded creatives (Section 2) are surfaced here too,
  //     reusing the exact same panel -- never a second/duplicated generator
  assert.ok(/import \{ FreeCreativesPanel \} from "@\/components\/audit\/FreeCreativesPanel"/.test(client), "must reuse the real, single FreeCreativesPanel, not a second implementation");
  assert.ok(/<FreeCreativesPanel \/>/.test(client), "the free-creatives panel must actually be rendered, not just imported");

  // --- 3. Existing underlying functionality preserved, not removed ------
  assert.ok(/CATEGORY_TABS/.test(client), "the existing category tabs must still exist -- simplification adds a clearer entry point, it doesn't remove real functionality");
  assert.ok(/href="\/app\/content\/studio"/.test(client), "Create Poster / Creative Studio must still be reachable");
  assert.ok(/href="\/app\/social\/copilot"/.test(client), "Ask Assistant must still be reachable");

  console.log("content-simplification.test.ts: ALL PASS (Connect Accounts added, free creatives surfaced, existing functionality untouched)");
}

run();
