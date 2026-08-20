/**
 * Checkout Engine & Order Preparation
 *
 * Validates carts, atomically reserves inventory, prepares server-side totals,
 * and sets up Razorpay orders.
 */

import type { Cart, Order, InventoryReservation } from "./types.ts";
import { cartManager } from "./cart.ts";
import { inventoryManager } from "./inventory.ts";

export interface CheckoutInput {
  tenantId: string;
  sessionToken: string;
  customerEmail: string;
  customerPhone?: string;
  shippingAddress: Record<string, string>;
  billingAddress?: Record<string, string>;
}

export interface CheckoutSessionResult {
  success: boolean;
  orderId: string;
  totalCents: number;
  currency: string;
  razorpayOrderPayload: {
    amountCents: number;
    currency: string;
    receipt: string;
    notes: Record<string, string>;
  };
  reservations: InventoryReservation[];
  error?: string;
}

export class CheckoutEngine {
  /**
   * Initializes a checkout session from an existing cart.
   */
  public async createCheckoutSession(input: CheckoutInput): Promise<CheckoutSessionResult> {
    const cart = cartManager.getOrCreateCart({ tenantId: input.tenantId, sessionToken: input.sessionToken });

    if (cart.items.length === 0) {
      return {
        success: false,
        orderId: "",
        totalCents: 0,
        currency: "INR",
        razorpayOrderPayload: { amountCents: 0, currency: "INR", receipt: "", notes: {} },
        reservations: [],
        error: "Cart is empty",
      };
    }

    // 1. Recalculate summary server-side
    const summary = cartManager.recalculateSummary(cart);
    const orderId = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const reservations: InventoryReservation[] = [];

    // 2. Atomically reserve inventory for all items
    try {
      for (const item of cart.items) {
        const res = inventoryManager.reserveStock({
          tenantId: input.tenantId,
          productId: item.productId,
          variantId: item.variantId,
          cartId: cart.id,
          quantity: item.quantity,
          timeoutMinutes: 15,
        });
        reservations.push(res);
      }
    } catch (err: unknown) {
      // Rollback any reservations made so far
      for (const res of reservations) {
        inventoryManager.releaseReservation(input.tenantId, res.reservationId);
      }
      return {
        success: false,
        orderId: "",
        totalCents: 0,
        currency: "INR",
        razorpayOrderPayload: { amountCents: 0, currency: "INR", receipt: "", notes: {} },
        reservations: [],
        error: (err as Error).message,
      };
    }

    // 3. Prepare server-side Razorpay order payload
    const razorpayOrderPayload = {
      amountCents: summary.totalCents,
      currency: summary.currency,
      receipt: orderId,
      notes: {
        tenantId: input.tenantId,
        orderId,
        customerEmail: input.customerEmail,
        reservationIds: reservations.map((r) => r.reservationId).join(","),
      },
    };

    return {
      success: true,
      orderId,
      totalCents: summary.totalCents,
      currency: summary.currency,
      razorpayOrderPayload,
      reservations,
    };
  }
}

export const checkoutEngine = new CheckoutEngine();
