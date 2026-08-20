/**
 * Master E-Commerce Engine
 *
 * Coordinates catalog management, inventory tracking, cart calculations,
 * checkout sessions, payment reconciliation, order lifecycles, and natural
 * language commerce mutations.
 */

import { catalogManager } from "./catalog.ts";
import { inventoryManager } from "./inventory.ts";
import { cartManager } from "./cart.ts";
import { discountManager } from "./discounts.ts";
import { checkoutEngine } from "./checkout.ts";
import { orderManager } from "./orders.ts";
import { aiCommerceTools } from "./ai-tools.ts";
import type { Product, Order, Cart, ProductVariant } from "./types.ts";

export class EcommerceEngine {
  public catalog = catalogManager;
  public inventory = inventoryManager;
  public cart = cartManager;
  public discounts = discountManager;
  public checkout = checkoutEngine;
  public orders = orderManager;
  public aiTools = aiCommerceTools;

  /**
   * Executes a natural-language commerce instruction safely.
   */
  public async executeNaturalLanguageCommerce(params: {
    tenantId: string;
    siteProjectId?: string;
    instruction: string;
  }): Promise<{ action: string; product?: Product; summary: string }> {
    const norm = params.instruction.toLowerCase().trim();

    // Example 1: "Add 20 black oversized T-shirts at ₹1,499"
    if (norm.includes("add") && (norm.includes("shirt") || norm.includes("hoodie") || norm.includes("t-shirt") || norm.includes("pants"))) {
      const priceMatch = norm.match(/(?:at|for|price|₹|\$)\s*([0-9,]+)/);
      const priceCents = priceMatch ? parseInt(priceMatch[1].replace(/,/g, ""), 10) * 100 : 199900;

      const nameMatch = params.instruction.match(/add\s+(?:\d+\s+)?([A-Za-z0-9\s-]+?)(?:\s+(?:at|for|price|₹|\$|with))/i);
      const productName = nameMatch ? nameMatch[1].trim() : "Signature Apparel Item";

      const product = this.catalog.createProduct({
        tenantId: params.tenantId,
        siteProjectId: params.siteProjectId,
        name: productName,
        slug: productName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        description: `Premium ${productName} handcrafted with sustainable materials.`,
        priceCents,
        currency: "INR",
        taxRatePercentage: 18.0,
        status: "ACTIVE",
        tags: ["apparel", "new-arrival"],
        images: [{ url: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800", isPrimary: true }],
        variants: [
          { id: "var_s", productId: "", sku: "SKU-S", title: "Small", options: { size: "S" }, isActive: true },
          { id: "var_m", productId: "", sku: "SKU-M", title: "Medium", options: { size: "M" }, isActive: true },
          { id: "var_l", productId: "", sku: "SKU-L", title: "Large", options: { size: "L" }, isActive: true },
          { id: "var_xl", productId: "", sku: "SKU-XL", title: "XL", options: { size: "XL" }, isActive: true },
        ],
      });

      // Set inventory
      const qtyMatch = norm.match(/(?:add\s+)(\d+)/);
      const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 20;
      this.inventory.setStock(params.tenantId, product.id, quantity);

      return {
        action: "PRODUCT_CREATED",
        product,
        summary: `Added ${product.name} at ₹${(product.priceCents / 100).toFixed(2)} with ${quantity} units in stock across S, M, L, XL`,
      };
    }

    // Example 2: "Change price of blue hoodie to ₹2,799"
    if (norm.includes("change") && norm.includes("price")) {
      const priceMatch = norm.match(/(?:to|₹|\$)\s*([0-9,]+)/);
      const newPriceCents = priceMatch ? parseInt(priceMatch[1].replace(/,/g, ""), 10) * 100 : 279900;

      const products = this.catalog.listPublicProducts(params.tenantId, params.siteProjectId);
      const target = products[0];

      if (target) {
        const updated = this.catalog.updateProduct(params.tenantId, target.id, { priceCents: newPriceCents });
        return {
          action: "PRICE_UPDATED",
          product: updated,
          summary: `Updated price of ${updated.name} to ₹${(newPriceCents / 100).toFixed(2)}`,
        };
      }
    }

    return {
      action: "NOOP",
      summary: `Instruction parsed without catalog mutations: ${params.instruction}`,
    };
  }
}

export const ecommerceEngine = new EcommerceEngine();
