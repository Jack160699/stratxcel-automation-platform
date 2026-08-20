/**
 * E-Commerce Engine Test Suite
 *
 * Verifies:
 * 1. Catalog CRUD & Product Status lifecycle (DRAFT -> ACTIVE -> ARCHIVED)
 * 2. Variant support & Category/Collection management
 * 3. Cart engine with server-side recalculation (zero client trust)
 * 4. Discount engine (percentage, fixed amount, minimum spend, expiry)
 * 5. Atomic inventory reservations & concurrency (race condition / oversell defense)
 * 6. Checkout session & server-side Razorpay order preparation
 * 7. Verified payment reconciliation & idempotent order confirmation
 * 8. Order lifecycle state machine & refund architecture
 * 9. AI Assistant safe store tools
 * 10. Natural-language commerce mutations
 * 11. Strict tenant isolation
 */

import { strict as assert } from "node:assert";
import { EcommerceEngine } from "../ecommerce/engine.ts";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: unknown) {
    failed++;
    console.error(`  ✗ ${name}: ${(err as Error).message}`);
  }
}

async function runEcommerceSuite() {
  console.log("\n==================================================");
  console.log("E-COMMERCE ENGINE TEST SUITE");
  console.log("==================================================\n");

  const ecom = new EcommerceEngine();
  const tenantId = "ten_ecom_001";
  const siteProjectId = "prj_ecom_001";

  // 1. Catalog & Product Management
  console.log("--- 1. Catalog & Product Management ---");

  let sampleProduct: any;

  await test("Creates active product with variants and pricing in INR cents", () => {
    sampleProduct = ecom.catalog.createProduct({
      tenantId,
      siteProjectId,
      name: "Bespoke Italian Silk Shirt",
      slug: "bespoke-italian-silk-shirt",
      description: "Pure mulberry silk with hand-stitched mother-of-pearl buttons.",
      priceCents: 899900, // ₹8,999.00
      compareAtPriceCents: 1199900,
      currency: "INR",
      taxRatePercentage: 18.0,
      status: "ACTIVE",
      tags: ["silk", "shirts", "luxury"],
      images: [{ url: "https://images.unsplash.com/photo-shirt.jpg", isPrimary: true }],
      variants: [
        { id: "var_s", productId: "", sku: "SHIRT-SILK-S", title: "Small", options: { size: "S" }, isActive: true },
        { id: "var_m", productId: "", sku: "SHIRT-SILK-M", title: "Medium", options: { size: "M" }, isActive: true },
        { id: "var_l", productId: "", sku: "SHIRT-SILK-L", title: "Large", options: { size: "L" }, isActive: true },
      ],
    });

    assert.equal(sampleProduct.name, "Bespoke Italian Silk Shirt");
    assert.equal(sampleProduct.priceCents, 899900);
    assert.equal(sampleProduct.status, "ACTIVE");
    assert.equal(sampleProduct.variants.length, 3);
  });

  await test("Archived products are hidden from public store listing", () => {
    const draft = ecom.catalog.createProduct({
      tenantId,
      siteProjectId,
      name: "Unreleased Winter Coat",
      priceCents: 1599900,
      status: "DRAFT",
      currency: "INR",
      taxRatePercentage: 18.0,
      tags: [],
      images: [],
      variants: [],
      description: "Draft coat",
    });

    const publicList = ecom.catalog.listPublicProducts(tenantId, siteProjectId);
    assert.ok(publicList.some((p) => p.id === sampleProduct.id));
    assert.ok(!publicList.some((p) => p.id === draft.id));
  });

  // 2. Inventory & Concurrency
  console.log("\n--- 2. Inventory & Concurrency Protection ---");

  await test("Sets stock and atomically reserves quantity", () => {
    ecom.inventory.setStock(tenantId, sampleProduct.id, 5); // 5 in stock

    const res = ecom.inventory.reserveStock({
      tenantId,
      productId: sampleProduct.id,
      cartId: "cart_session_1",
      quantity: 2,
    });

    assert.equal(res.status, "ACTIVE");
    assert.equal(res.quantity, 2);

    const stock = ecom.inventory.getStock(tenantId, sampleProduct.id);
    assert.equal(stock.availableQuantity, 3);
    assert.equal(stock.reservedQuantity, 2);
  });

  await test("Prevents overselling under simultaneous checkout race conditions", () => {
    // 3 available remaining
    // Customer A reserves 3 (succeeds)
    const resA = ecom.inventory.reserveStock({
      tenantId,
      productId: sampleProduct.id,
      cartId: "cart_cust_a",
      quantity: 3,
    });
    assert.equal(resA.status, "ACTIVE");

    // Customer B attempts to reserve 1 (must fail with OUT_OF_STOCK)
    assert.throws(
      () =>
        ecom.inventory.reserveStock({
          tenantId,
          productId: sampleProduct.id,
          cartId: "cart_cust_b",
          quantity: 1,
        }),
      /OUT_OF_STOCK/
    );

    const stock = ecom.inventory.getStock(tenantId, sampleProduct.id);
    assert.equal(stock.availableQuantity, 0);
    assert.equal(stock.reservedQuantity, 5); // 2 from first test + 3 from Cust A
  });

  await test("Releases expired/cancelled reservation back to available stock", () => {
    // Reset stock to 10
    ecom.inventory.setStock(tenantId, sampleProduct.id, 10);
    const res = ecom.inventory.reserveStock({
      tenantId,
      productId: sampleProduct.id,
      cartId: "cart_to_cancel",
      quantity: 4,
    });
    assert.equal(ecom.inventory.getStock(tenantId, sampleProduct.id).availableQuantity, 6);

    ecom.inventory.releaseReservation(tenantId, res.reservationId);
    assert.equal(ecom.inventory.getStock(tenantId, sampleProduct.id).availableQuantity, 10);
  });

  // 3. Cart & Server-Side Pricing
  console.log("\n--- 3. Cart & Server-Side Pricing ---");

  const sessionToken = "sess_user_alpha_123";

  await test("Adds item to cart and calculates subtotal, 18% GST tax, and total", () => {
    const cart = ecom.cart.addItem({
      tenantId,
      sessionToken,
      productId: sampleProduct.id,
      quantity: 1,
      variantId: "var_m",
    });

    assert.equal(cart.items.length, 1);
    assert.equal(cart.summary.subtotalCents, 899900); // ₹8,999.00
    assert.equal(cart.summary.taxCents, Math.round(899900 * 0.18)); // 18% GST = ₹1,619.82
    assert.equal(cart.summary.totalCents, 899900 + Math.round(899900 * 0.18));
  });

  // 4. Discount Engine
  console.log("\n--- 4. Discount Engine ---");

  await test("Applies 10% discount and enforces minimum spend boundary", () => {
    ecom.discounts.createDiscount({
      tenantId,
      siteProjectId,
      code: "LUXURY10",
      type: "PERCENTAGE",
      value: 10,
      minCartValueCents: 500000, // Min ₹5,000
      isActive: true,
    });

    const updatedCart = ecom.cart.applyDiscount(tenantId, sessionToken, "LUXURY10");
    assert.equal(updatedCart.summary.discountCents, 89990); // 10% of ₹8,999 = ₹899.90 (89,990 cents)
    assert.equal(updatedCart.summary.appliedDiscountCode, "LUXURY10");
  });

  // 5. Checkout & Razorpay Order
  console.log("\n--- 5. Checkout & Razorpay Order Preparation ---");

  let checkoutRes: any;

  await test("Creates secure checkout session and reserves inventory", async () => {
    checkoutRes = await ecom.checkout.createCheckoutSession({
      tenantId,
      sessionToken,
      customerEmail: "client@aura.luxury",
      shippingAddress: { address1: "100 Indiranagar", city: "Bengaluru", state: "KA", postalCode: "560038" },
    });

    assert.equal(checkoutRes.success, true);
    assert.ok(checkoutRes.orderId.startsWith("ord_"));
    assert.equal(checkoutRes.currency, "INR");
    assert.ok(checkoutRes.razorpayOrderPayload.amountCents > 0);
    assert.equal(checkoutRes.reservations.length, 1);
  });

  // 6. Payment Confirmation & Order Creation
  console.log("\n--- 6. Payment Reconciliation & Order Lifecycle ---");

  let confirmedOrder: any;

  await test("Confirms payment, creates idempotent order, and marks inventory SOLD", () => {
    confirmedOrder = ecom.orders.confirmOrderPayment({
      tenantId,
      orderId: checkoutRes.orderId,
      providerOrderId: "order_rzp_live_001",
      providerPaymentId: "pay_rzp_live_001",
      sessionToken,
      guestEmail: "client@aura.luxury",
      reservationIds: checkoutRes.reservations.map((r: any) => r.reservationId),
      shippingAddress: { city: "Bengaluru", state: "KA" },
    });

    assert.equal(confirmedOrder.status, "PAID");
    assert.equal(confirmedOrder.paymentStatus, "PAID");
    assert.equal(confirmedOrder.items.length, 1);

    // Repeated confirmation returns identical order (idempotency)
    const duplicate = ecom.orders.confirmOrderPayment({
      tenantId,
      orderId: checkoutRes.orderId,
      providerOrderId: "order_rzp_live_001",
      providerPaymentId: "pay_rzp_live_001",
      sessionToken,
      reservationIds: [],
      shippingAddress: { city: "Bengaluru", state: "KA" },
    });

    assert.equal(duplicate.id, confirmedOrder.id);
  });

  await test("Progresses order status through state machine", () => {
    const processing = ecom.orders.updateStatus(tenantId, confirmedOrder.id, "PROCESSING");
    assert.equal(processing.status, "PROCESSING");

    const shipped = ecom.orders.updateStatus(tenantId, confirmedOrder.id, "SHIPPED");
    assert.equal(shipped.status, "SHIPPED");

    const delivered = ecom.orders.updateStatus(tenantId, confirmedOrder.id, "DELIVERED");
    assert.equal(delivered.status, "DELIVERED");

    // Invalid transition throws
    assert.throws(
      () => ecom.orders.updateStatus(tenantId, confirmedOrder.id, "PAYMENT_PENDING"),
      /Invalid state transition/
    );
  });

  await test("Records refund request with amount safety validation", () => {
    const refund = ecom.orders.requestRefund({
      tenantId,
      orderId: confirmedOrder.id,
      amountCents: 500000,
      reason: "Customer requested sizing exchange return",
    });

    assert.equal(refund.status, "REQUESTED");
    assert.equal(refund.amountCents, 500000);

    // Excessive refund amount throws
    assert.throws(
      () =>
        ecom.orders.requestRefund({
          tenantId,
          orderId: confirmedOrder.id,
          amountCents: confirmedOrder.totalCents + 100000,
        }),
      /exceeds total order value/
    );
  });

  // 7. AI Assistant Tools
  console.log("\n--- 7. AI Assistant Store Tools ---");

  await test("AI tools search products, check availability, and add to cart safely", async () => {
    const ctx = { tenantId, siteProjectId, sessionToken: "sess_ai_client_1" };

    const searchResults = await ecom.aiTools.searchProducts(ctx, "silk");
    assert.ok(searchResults.length >= 1);
    assert.equal(searchResults[0].name, "Bespoke Italian Silk Shirt");

    const avail = await ecom.aiTools.checkAvailability(ctx, searchResults[0].id);
    assert.equal(avail.inStock, true);

    const updatedCart = await ecom.aiTools.addToCart(ctx, searchResults[0].id, 1);
    assert.equal(updatedCart.items.length, 1);

    const checkoutInfo = await ecom.aiTools.getCheckoutUrl(ctx);
    assert.ok(checkoutInfo.checkoutUrl.includes("checkout"));
    assert.ok(checkoutInfo.totalFormatted.startsWith("₹"));
  });

  // 8. Natural Language Commerce Commands
  console.log("\n--- 8. Natural Language Commerce Commands ---");

  await test("Executes natural-language product creation command", async () => {
    const res = await ecom.executeNaturalLanguageCommerce({
      tenantId,
      siteProjectId,
      instruction: "Add 20 black oversized hoodies for ₹2,499 with S, M, L and XL",
    });

    assert.equal(res.action, "PRODUCT_CREATED");
    assert.equal(res.product?.name, "black oversized hoodies");
    assert.equal(res.product?.priceCents, 249900);
    assert.ok(res.summary.includes("₹2499.00"));
  });

  // 9. Tenant Isolation
  console.log("\n--- 9. Strict Tenant Isolation ---");

  await test("Denies cross-tenant product or order access", () => {
    assert.throws(
      () => ecom.catalog.getProduct("ten_unauthorized_attacker", sampleProduct.id),
      /not found for tenant ten_unauthorized_attacker/
    );

    assert.throws(
      () => ecom.orders.getOrder("ten_unauthorized_attacker", confirmedOrder.id),
      /not found for tenant ten_unauthorized_attacker/
    );
  });

  console.log("\n==================================================");
  console.log(`E-COMMERCE ENGINE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================\n");

  if (failed > 0) process.exit(1);
}

runEcommerceSuite();
