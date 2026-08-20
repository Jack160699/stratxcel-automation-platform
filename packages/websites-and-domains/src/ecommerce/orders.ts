/**
 * Order Manager & Lifecycle State Machine
 *
 * Enforces verified payment reconciliation, idempotent order confirmation,
 * strict state transitions, and refund requests.
 */

import type { Order, OrderStatus, RefundRecord, RefundStatus } from "./types.ts";
import { cartManager } from "./cart.ts";
import { inventoryManager } from "./inventory.ts";

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PAYMENT_PENDING: ["PAID", "PAYMENT_FAILED", "PAYMENT_EXPIRED", "CANCELLED"],
  PAID: ["PROCESSING", "REFUNDED", "CANCELLED"],
  PROCESSING: ["SHIPPED", "REFUNDED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "REFUNDED"],
  DELIVERED: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
  PAYMENT_FAILED: ["PAYMENT_PENDING"],
  PAYMENT_EXPIRED: ["PAYMENT_PENDING"],
};

export class OrderManager {
  private orders: Map<string, Order> = new Map();
  private refunds: Map<string, RefundRecord> = new Map();
  private processedPayments: Set<string> = new Set();

  /**
   * Idempotently creates/confirms a paid order after verified Razorpay webhook.
   */
  public confirmOrderPayment(params: {
    tenantId: string;
    orderId: string;
    providerOrderId: string;
    providerPaymentId: string;
    sessionToken: string;
    guestEmail?: string;
    reservationIds: string[];
    shippingAddress: Record<string, string>;
  }): Order {
    if (this.processedPayments.has(params.providerPaymentId)) {
      const existing = this.orders.get(params.orderId);
      if (existing) return existing;
    }

    const cart = cartManager.getOrCreateCart({ tenantId: params.tenantId, sessionToken: params.sessionToken });
    const summary = cartManager.recalculateSummary(cart);

    // 1. Confirm inventory reservations to SOLD
    for (const resId of params.reservationIds) {
      inventoryManager.confirmReservation(params.tenantId, resId);
    }

    // 2. Build immutable Order Record
    const order: Order = {
      id: params.orderId,
      tenantId: params.tenantId,
      siteProjectId: cart.siteProjectId,
      customerId: cart.customerId,
      guestEmail: params.guestEmail,
      status: "PAID",
      items: cart.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        productName: item.productName,
        variantTitle: item.variantTitle,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        totalPriceCents: item.unitPriceCents * item.quantity,
      })),
      subtotalCents: summary.subtotalCents,
      discountCents: summary.discountCents,
      taxCents: summary.taxCents,
      shippingCents: summary.shippingCents,
      totalCents: summary.totalCents,
      currency: summary.currency,
      paymentProvider: "razorpay",
      providerOrderId: params.providerOrderId,
      providerPaymentId: params.providerPaymentId,
      paymentStatus: "PAID",
      shippingAddress: params.shippingAddress,
      billingAddress: params.shippingAddress,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.orders.set(params.orderId, order);
    this.processedPayments.add(params.providerPaymentId);
    return order;
  }

  /**
   * Transitions an order to a new state if allowed by state machine.
   */
  public updateStatus(tenantId: string, orderId: string, nextStatus: OrderStatus): Order {
    const order = this.orders.get(orderId);
    if (!order || order.tenantId !== tenantId) {
      throw new Error(`Order ${orderId} not found for tenant ${tenantId}`);
    }

    const allowed = VALID_TRANSITIONS[order.status] || [];
    if (!allowed.includes(nextStatus)) {
      throw new Error(`Invalid state transition: Cannot change order from ${order.status} to ${nextStatus}`);
    }

    order.status = nextStatus;
    order.updatedAt = new Date().toISOString();
    this.orders.set(orderId, order);
    return order;
  }

  /**
   * Retrieves an order by ID.
   */
  public getOrder(tenantId: string, orderId: string): Order {
    const order = this.orders.get(orderId);
    if (!order || order.tenantId !== tenantId) {
      throw new Error(`Order ${orderId} not found for tenant ${tenantId}`);
    }
    return order;
  }

  /**
   * Requests a refund for an order.
   */
  public requestRefund(params: {
    tenantId: string;
    orderId: string;
    amountCents: number;
    reason?: string;
    actorUserId?: string;
  }): RefundRecord {
    const order = this.getOrder(params.tenantId, params.orderId);

    if (order.status !== "PAID" && order.status !== "PROCESSING" && order.status !== "SHIPPED" && order.status !== "DELIVERED") {
      throw new Error(`Cannot request refund: Order ${params.orderId} is in status ${order.status}`);
    }

    if (params.amountCents > order.totalCents) {
      throw new Error(`Refund amount ₹${(params.amountCents / 100).toFixed(2)} exceeds total order value ₹${(order.totalCents / 100).toFixed(2)}`);
    }

    const refundId = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const refund: RefundRecord = {
      id: refundId,
      tenantId: params.tenantId,
      orderId: params.orderId,
      amountCents: params.amountCents,
      reason: params.reason,
      status: "REQUESTED",
      actorUserId: params.actorUserId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.refunds.set(refundId, refund);
    return refund;
  }
}

export const orderManager = new OrderManager();
