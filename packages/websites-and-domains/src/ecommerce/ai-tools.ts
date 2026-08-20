/**
 * AI Store Assistant Commerce Tools
 *
 * Exposes safe, permissioned commerce actions for the AI Assistant:
 *   - Search catalog
 *   - Check stock availability
 *   - Add to customer cart
 *   - Direct to checkout
 *
 * Strictly blocks unauthorized actions (price mutations, refunds, cross-tenant queries).
 */

import { catalogManager } from "./catalog.ts";
import { inventoryManager } from "./inventory.ts";
import { cartManager } from "./cart.ts";
import type { Product, Cart } from "./types.ts";

export interface AICommerceContext {
  tenantId: string;
  siteProjectId?: string;
  sessionToken: string;
}

export class AICommerceTools {
  /**
   * Safe product search for AI agent.
   */
  public async searchProducts(ctx: AICommerceContext, query: string): Promise<Product[]> {
    const products = catalogManager.listPublicProducts(ctx.tenantId, ctx.siteProjectId);
    const q = query.toLowerCase().trim();

    return products.filter((p) => {
      return (
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }

  /**
   * Checks inventory availability without exposing internal warehouse quantities.
   */
  public async checkAvailability(
    ctx: AICommerceContext,
    productId: string,
    variantId?: string
  ): Promise<{ inStock: boolean; status: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" }> {
    // Validate product belongs to tenant
    const product = catalogManager.getProduct(ctx.tenantId, productId);
    if (product.status !== "ACTIVE") {
      return { inStock: false, status: "OUT_OF_STOCK" };
    }

    const stock = inventoryManager.getStock(ctx.tenantId, productId, variantId);
    if (stock.availableQuantity === 0) {
      return { inStock: false, status: "OUT_OF_STOCK" };
    }
    if (stock.availableQuantity <= stock.lowStockThreshold) {
      return { inStock: true, status: "LOW_STOCK" };
    }
    return { inStock: true, status: "IN_STOCK" };
  }

  /**
   * Adds an item to the current customer's cart.
   */
  public async addToCart(
    ctx: AICommerceContext,
    productId: string,
    quantity = 1,
    variantId?: string
  ): Promise<Cart> {
    return cartManager.addItem({
      tenantId: ctx.tenantId,
      sessionToken: ctx.sessionToken,
      productId,
      quantity,
      variantId,
    });
  }

  /**
   * Generates checkout URL for the current cart.
   */
  public async getCheckoutUrl(ctx: AICommerceContext): Promise<{ checkoutUrl: string; totalFormatted: string }> {
    const cart = cartManager.getOrCreateCart({ tenantId: ctx.tenantId, sessionToken: ctx.sessionToken });
    const summary = cartManager.recalculateSummary(cart);

    return {
      checkoutUrl: `/app/website/${ctx.siteProjectId || "default"}/checkout?session=${ctx.sessionToken}`,
      totalFormatted: `₹${(summary.totalCents / 100).toFixed(2)}`,
    };
  }
}

export const aiCommerceTools = new AICommerceTools();
