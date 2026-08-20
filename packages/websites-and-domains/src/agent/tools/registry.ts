/**
 * Typed Tool Registry for AI Business Agent
 *
 * Implements granular tool handlers connecting to the underlying E-Commerce,
 * Catalog, Cart, Order, and Lead Capture engines with strict permission tagging.
 */

import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from "../types.ts";
import { catalogManager } from "../../ecommerce/catalog.ts";
import { inventoryManager } from "../../ecommerce/inventory.ts";
import { cartManager } from "../../ecommerce/cart.ts";
import { checkoutEngine } from "../../ecommerce/checkout.ts";
import { orderManager } from "../../ecommerce/orders.ts";
import type { Product } from "../../ecommerce/types.ts";

export interface ToolHandler {
  definition: ToolDefinition;
  execute: (ctx: ToolExecutionContext, args: Record<string, unknown>) => Promise<ToolExecutionResult>;
}

export class ToolRegistry {
  private tools: Map<string, ToolHandler> = new Map();
  // In-memory lead capture store
  private leads: Array<{ tenantId: string; projectId: string; name?: string; email?: string; phone?: string; requirement?: string; capturedAt: string }> = [];

  constructor() {
    this.registerDefaultTools();
  }

  private registerDefaultTools(): void {
    // 1. search_products
    this.register({
      definition: {
        name: "search_products",
        description: "Search active public products by keyword, category, color, or maximum price.",
        parameters: { query: "string", category: "string?", maxPriceCents: "number?", color: "string?" },
        permissionLevel: "PUBLIC",
        requiresConfirmation: false,
      },
      execute: async (ctx, args) => {
        const query = typeof args.query === "string" ? args.query.toLowerCase().trim() : "";
        const maxPriceCents = typeof args.maxPriceCents === "number" ? args.maxPriceCents : undefined;
        const color = typeof args.color === "string" ? args.color.toLowerCase().trim() : undefined;

        const allProducts = catalogManager.listPublicProducts(ctx.tenantId, ctx.projectId);
        const filtered = allProducts.filter((p) => {
          const matchQuery = !query || p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query) || p.tags.some((t) => t.toLowerCase().includes(query));
          const matchPrice = maxPriceCents === undefined || p.priceCents <= maxPriceCents;
          const matchColor = !color || p.description.toLowerCase().includes(color) || p.name.toLowerCase().includes(color) || p.variants.some((v) => JSON.stringify(v.options).toLowerCase().includes(color));
          return matchQuery && matchPrice && matchColor;
        });

        return { tool: "search_products", success: true, data: filtered };
      },
    });

    // 2. get_product
    this.register({
      definition: {
        name: "get_product",
        description: "Get detailed product information including variants and pricing.",
        parameters: { productId: "string" },
        permissionLevel: "PUBLIC",
        requiresConfirmation: false,
      },
      execute: async (ctx, args) => {
        const productId = String(args.productId);
        const product = catalogManager.getProduct(ctx.tenantId, productId);
        return { tool: "get_product", success: true, data: product };
      },
    });

    // 3. check_product_availability
    this.register({
      definition: {
        name: "check_product_availability",
        description: "Check if a product is in stock without exposing exact warehouse quantities.",
        parameters: { productId: "string", variantId: "string?" },
        permissionLevel: "PUBLIC",
        requiresConfirmation: false,
      },
      execute: async (ctx, args) => {
        const productId = String(args.productId);
        const variantId = typeof args.variantId === "string" ? args.variantId : undefined;
        const product = catalogManager.getProduct(ctx.tenantId, productId);

        if (product.status !== "ACTIVE") {
          return { tool: "check_product_availability", success: true, data: { status: "UNAVAILABLE", inStock: false } };
        }

        const stock = inventoryManager.getStock(ctx.tenantId, productId, variantId);
        let status: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" = "IN_STOCK";
        if (stock.availableQuantity === 0) status = "OUT_OF_STOCK";
        else if (stock.availableQuantity <= stock.lowStockThreshold) status = "LOW_STOCK";

        return {
          tool: "check_product_availability",
          success: true,
          data: { status, inStock: stock.availableQuantity > 0 },
        };
      },
    });

    // 4. add_to_cart
    this.register({
      definition: {
        name: "add_to_cart",
        description: "Add an item to the customer's active shopping cart.",
        parameters: { productId: "string", quantity: "number", variantId: "string?" },
        permissionLevel: "CUSTOMER_SESSION",
        requiresConfirmation: false,
      },
      execute: async (ctx, args) => {
        const sessionToken = ctx.sessionToken || "default_session";
        const productId = String(args.productId);
        const quantity = typeof args.quantity === "number" ? args.quantity : 1;
        const variantId = typeof args.variantId === "string" ? args.variantId : undefined;

        const updatedCart = cartManager.addItem({
          tenantId: ctx.tenantId,
          sessionToken,
          productId,
          quantity,
          variantId,
        });

        return { tool: "add_to_cart", success: true, data: updatedCart };
      },
    });

    // 5. view_cart
    this.register({
      definition: {
        name: "view_cart",
        description: "View the customer's current shopping cart and server-calculated totals.",
        parameters: {},
        permissionLevel: "CUSTOMER_SESSION",
        requiresConfirmation: false,
      },
      execute: async (ctx) => {
        const sessionToken = ctx.sessionToken || "default_session";
        const cart = cartManager.getOrCreateCart({ tenantId: ctx.tenantId, sessionToken, siteProjectId: ctx.projectId });
        const summary = cartManager.recalculateSummary(cart);
        return { tool: "view_cart", success: true, data: { items: cart.items, summary } };
      },
    });

    // 6. create_checkout_link
    this.register({
      definition: {
        name: "create_checkout_link",
        description: "Generate a secure checkout link for the customer's current cart.",
        parameters: { customerEmail: "string?" },
        permissionLevel: "CUSTOMER_SESSION",
        requiresConfirmation: false,
      },
      execute: async (ctx, args) => {
        const sessionToken = ctx.sessionToken || "default_session";
        const customerEmail = typeof args.customerEmail === "string" ? args.customerEmail : ctx.customerEmail || "guest@checkout.local";

        const checkoutRes = await checkoutEngine.createCheckoutSession({
          tenantId: ctx.tenantId,
          sessionToken,
          customerEmail,
          shippingAddress: { city: "Bengaluru", state: "KA" },
        });

        if (!checkoutRes.success) {
          return { tool: "create_checkout_link", success: false, error: checkoutRes.error };
        }

        const checkoutUrl = `/app/website/${ctx.projectId}/checkout?session=${sessionToken}`;
        return {
          tool: "create_checkout_link",
          success: true,
          data: {
            checkoutUrl,
            orderId: checkoutRes.orderId,
            totalCents: checkoutRes.totalCents,
            totalFormatted: `₹${(checkoutRes.totalCents / 100).toFixed(2)}`,
          },
        };
      },
    });

    // 7. capture_lead
    this.register({
      definition: {
        name: "capture_lead",
        description: "Record visitor contact details and requirements for follow-up.",
        parameters: { name: "string?", email: "string?", phone: "string?", requirement: "string?" },
        permissionLevel: "PUBLIC",
        requiresConfirmation: false,
      },
      execute: async (ctx, args) => {
        const lead = {
          tenantId: ctx.tenantId,
          projectId: ctx.projectId,
          name: typeof args.name === "string" ? args.name : undefined,
          email: typeof args.email === "string" ? args.email : undefined,
          phone: typeof args.phone === "string" ? args.phone : undefined,
          requirement: typeof args.requirement === "string" ? args.requirement : undefined,
          capturedAt: new Date().toISOString(),
        };

        this.leads.push(lead);
        return { tool: "capture_lead", success: true, data: { captured: true, leadId: `lead_${Date.now()}` } };
      },
    });

    // 8. get_order_status
    this.register({
      definition: {
        name: "get_order_status",
        description: "Look up order status for the authenticated or verified customer.",
        parameters: { orderId: "string" },
        permissionLevel: "CUSTOMER_SESSION",
        requiresConfirmation: false,
      },
      execute: async (ctx, args) => {
        const orderId = String(args.orderId);
        const order = orderManager.getOrder(ctx.tenantId, orderId);

        // Verify customer ownership if guestEmail/customerId is present
        if (ctx.customerEmail && order.guestEmail && order.guestEmail.toLowerCase() !== ctx.customerEmail.toLowerCase()) {
          return { tool: "get_order_status", success: false, error: "Order not found for current customer session" };
        }

        return {
          tool: "get_order_status",
          success: true,
          data: {
            orderId: order.id,
            status: order.status,
            totalFormatted: `₹${(order.totalCents / 100).toFixed(2)}`,
            itemCount: order.items.length,
            createdAt: order.createdAt,
          },
        };
      },
    });

    // 9. get_business_info
    this.register({
      definition: {
        name: "get_business_info",
        description: "Get verified public business information, hours, and contact details.",
        parameters: {},
        permissionLevel: "PUBLIC",
        requiresConfirmation: false,
      },
      execute: async (ctx) => {
        return {
          tool: "get_business_info",
          success: true,
          data: {
            tenantId: ctx.tenantId,
            projectId: ctx.projectId,
            businessName: "Aura Atelier",
            tagline: "Bespoke Italian Tailoring",
            supportEmail: "concierge@auraatelier.com",
            phone: "+91 80 4000 1234",
            hours: "Monday - Saturday: 10:00 AM - 8:00 PM IST",
          },
        };
      },
    });

    // 10. Restricted Administrative Tools (To enforce and test permission gating)
    this.register({
      definition: {
        name: "modify_product_price",
        description: "Restricted owner tool to modify catalog product prices.",
        parameters: { productId: "string", newPriceCents: "number" },
        permissionLevel: "RESTRICTED",
        requiresConfirmation: true,
      },
      execute: async () => {
        return { tool: "modify_product_price", success: false, error: "RESTRICTED_ACCESS_DENIED" };
      },
    });
  }

  public register(handler: ToolHandler): void {
    this.tools.set(handler.definition.name, handler);
  }

  public getTool(name: string): ToolHandler | undefined {
    return this.tools.get(name);
  }

  public listTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  public getCapturedLeads(tenantId: string): typeof this.leads {
    return this.leads.filter((l) => l.tenantId === tenantId);
  }
}

export const toolRegistry = new ToolRegistry();
