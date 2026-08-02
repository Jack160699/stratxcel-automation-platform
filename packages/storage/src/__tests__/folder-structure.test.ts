// Run with: node --experimental-strip-types packages/storage/src/__tests__/folder-structure.test.ts
import assert from "node:assert/strict";
import { FOLDER_STRUCTURE, getFolderLabel, listFolderCategories, ROOT_FOLDER_NAME } from "../folder-structure.ts";

function run() {
  assert.equal(ROOT_FOLDER_NAME, "StratExcel AI");
  assert.equal(getFolderLabel("brand_assets"), "Brand Assets");
  assert.equal(getFolderLabel("legal_documents"), "Legal Documents");

  const categories = listFolderCategories();
  assert.equal(categories.length, 9);
  assert.deepEqual(new Set(categories), new Set(Object.keys(FOLDER_STRUCTURE)));

  console.log("folder-structure.test.ts (@stratxcel/storage): ALL PASS");
}

run();
