/**
 * Cart Manager & Summary Calculator
 *
 * Implements server-side item additions, quantity recalculation, discount application,
 * tax computation, and shipping rules.
 */

import type { Cart, CartItem, CartSummary } from "./types.ts";
import { catalogManager } from "./catalog.ts";
import { discountManager } from "./discounts.ts";

export class CartManager {
  private carts: Map<string, Cart> = new Map();

  /**
   * Creates or retrieves a cart by session token.
   */
  public getOrCreateCart(params: {
    tenantId: string;
    sessionToken: string;
    siteProjectId?: string;
    customerId?: string;
  }): Cart {
    const existing = this.carts.get(params.sessionToken);
    if (existing && existing.tenantId === params.tenantId) {
      return existing;
    }

    const newCart: Cart = {
      id: `cart_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tenantId: params.tenantId,
      siteProjectId: params.siteProjectId,
      customerId: params.customerId,
      sessionToken: params.sessionToken,
      currency: "INR",
      items: [],
      summary: {
        subtotalCents: 0,
        discountCents: 0,
        taxCents: 0,
        shippingCents: 0,
        totalCents: 0,
        currency: "INR",
      },
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.carts.set(params.sessionToken, newCart);
    return newCart;
  }

  /**
   * Adds an item to the cart and recalculates summary server-side.
   */
  public addItem(params: {
    tenantId: string;
    sessionToken: string;
    productId: string;
    quantity: number;
    variantId?: string;
  }): Cart {
    const cart = this.getOrCreateCart({ tenantId: params.tenantId, sessionToken: params.sessionToken });
    const product = catalogManager.getProduct(params.tenantId, params.productId);

    if (product.status !== "ACTIVE") {
      throw new Error(`Cannot add inactive product ${product.name} to cart`);
    }

    let unitPriceCents = product.priceCents;
    let variantTitle: string | undefined;

    if (params.variantId) {
      const variant = product.variants.find((v) => v.id === params.variantId);
      if (variant) {
        variantTitle = variant.title;
        if (variant.priceOverrideCents !== undefined) {
          unitPriceCents = variant.priceOverrideCents;
        }
      }
    }

    const existingIndex = cart.items.findIndex(
      (item) => item.productId === params.productId && item.variantId === params.variantId
    );

    if (existingIndex >= 0) {
      cart.items[existingIndex].quantity += params.quantity;
    } else {
      cart.items.push({
        productId: params.productId,
        variantId: params.variantId,
        quantity: params.quantity,
        productName: product.name,
        variantTitle,
        unitPriceCents,
        image: product.images[0]?.url,
      });
    }

    this.recalculateSummary(cart);
    this.carts.set(params.sessionToken, cart);
    return cart;
  }

  /**
   * Removes an item from the cart.
   */
  public removeItem(tenantId: string, sessionToken: string, productId: string, variantId?: string): Cart {
    const cart = this.getOrCreateCart({ tenantId, sessionToken });
    cart.items = cart.items.filter((item) => !(item.productId === productId && item.variantId === variantId));
    this.recalculateSummary(cart);
    this.carts.set(sessionToken, cart);
    return cart;
  }

  /**
   * Applies a discount code to the cart.
   */
  public applyDiscount(tenantId: string, sessionToken: string, code: string): Cart {
    const cart = this.getOrCreateCart({ tenantId, sessionToken });
    cart.discountCode = code.toUpperCase().trim();
    this.recalculateSummary(cart);
    this.carts.set(sessionToken, cart);
    return cart;
  }

  /**
   * Recalculates cart monetary values on the server.
   */
  public recalculateSummary(cart: Cart): CartSummary {
    let subtotalCents = 0;
    for (const item of cart.items) {
      subtotalCents += item.unitPriceCents * item.quantity;
    }

    let discountCents = 0;
    if (cart.discountCode) {
      const evaluation = discountManager.evaluateDiscount({
        tenantId: cart.tenantId,
        code: cart.discountCode,
        subtotalCents,
        siteProjectId: cart.siteProjectId,
      });
      if (evaluation.valid) {
        discountCents = evaluation.discountCents;
      }
    }

    const discountedSubtotal = Math.max(0, subtotalCents - discountCents);
    // Standard GST 18% tax calculation on taxable amount
    const taxCents = Math.round(discountedSubtotal * 0.18);
    // Complimentary express shipping for orders over ₹1,000 (100,000 cents), else ₹99 (9,900 cents)
    const shippingCents = discountedSubtotal > 100_000 || cart.items.length === 0 ? 0 : 9_900;
    const totalCents = discountedSubtotal + taxCents + shippingCents;

    cart.summary = {
      subtotalCents,
      discountCents,
      taxCents,
      shippingCents,
      totalCents,
      currency: cart.currency,
      appliedDiscountCode: discountCents > 0 ? cart.discountCode : undefined,
    };

    cart.updatedAt = new Date().toISOString();
    return cart.summary;
  }
}

export const cartManager = new CartManager();
