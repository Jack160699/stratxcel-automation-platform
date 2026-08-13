import assert from "node:assert/strict";
import {
  ALL_PRODUCTS,
  PRODUCT_GROUPS,
  PRODUCTS,
  getProductHref,
  getProductsByGroup,
} from "../taxonomy.ts";

function run() {
  assert.equal(ALL_PRODUCTS.length, Object.keys(PRODUCTS).length);
  assert.ok(ALL_PRODUCTS.length >= 16);
  const groupedIds = new Set(PRODUCT_GROUPS.flatMap((g) => g.productIds));
  for (const id of Object.keys(PRODUCTS)) assert.ok(groupedIds.has(id));
  for (const product of ALL_PRODUCTS) {
    assert.ok(product.outcome.length > 10);
    assert.ok(getProductHref(product).startsWith("/"));
  }
  assert.equal(PRODUCTS["video-reels"].availability, "coming-later");
  assert.equal(PRODUCTS["business-growth-audit"].availability, "live");
  console.log("taxonomy.test.ts: ALL PASS");
}
run();
