import assert from "node:assert/strict";
import { ALL_PRODUCTS, PRODUCTS } from "../taxonomy.ts";
import {
  CUSTOMER_OUTCOME_GROUPS,
  CUSTOMER_PRODUCT_PRESENTATION,
  HOMEPAGE_FEATURED_PRODUCT_IDS,
  getAllCustomerOutcomeProductIds,
  getCustomerPresentation,
  getCustomerPresentationForProduct,
  getProductsByCustomerOutcomeGroup,
} from "../customer-language.ts";

function run() {
  for (const product of ALL_PRODUCTS) {
    const presentation = getCustomerPresentation(product.id);
    assert.ok(presentation, `missing presentation for ${product.id}`);
    assert.ok(presentation.headline.length > 5);
    assert.ok(presentation.problem.length > 10);
    assert.ok(presentation.capability.length > 10);
    assert.ok(presentation.ctaLabel.length > 3);
  }

  assert.equal(Object.keys(CUSTOMER_PRODUCT_PRESENTATION).length, Object.keys(PRODUCTS).length);

  const groupedIds = getAllCustomerOutcomeProductIds();
  const uniqueGroupedIds = new Set(groupedIds);
  assert.equal(groupedIds.length, uniqueGroupedIds.size, "products must appear in outcome groups exactly once");
  for (const id of Object.keys(PRODUCTS)) {
    assert.ok(uniqueGroupedIds.has(id), `product ${id} missing from outcome groups`);
  }

  for (const group of CUSTOMER_OUTCOME_GROUPS) {
    const products = getProductsByCustomerOutcomeGroup(group.id);
    assert.equal(products.length, group.productIds.length);
  }

  for (const id of HOMEPAGE_FEATURED_PRODUCT_IDS) {
    assert.ok(PRODUCTS[id], `homepage featured product missing: ${id}`);
    assert.ok(getCustomerPresentation(id));
  }

  const seo = getCustomerPresentationForProduct(PRODUCTS["seo-intelligence"]);
  assert.match(seo.headline.toLowerCase(), /google/);
  assert.match(seo.headline.toLowerCase(), /found/);

  const crm = getCustomerPresentationForProduct(PRODUCTS.crm);
  assert.match(crm.headline.toLowerCase(), /enquir/);

  console.log("customer-language.test.ts: ALL PASS");
}

run();
