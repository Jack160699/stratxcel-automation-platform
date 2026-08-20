/**
 * Atomic Inventory & Reservation Manager
 *
 * Prevents overselling, manages reservations with timeouts, and
 * atomically transitions stock on payment confirmation or expiration.
 */

import type { InventoryRecord, InventoryReservation } from "./types.ts";

export class InventoryManager {
  // Key: `${tenantId}:${productId}:${variantId || 'default'}`
  private inventoryStore: Map<string, InventoryRecord> = new Map();
  // Key: reservationId
  private reservations: Map<string, InventoryReservation> = new Map();

  private getStockKey(tenantId: string, productId: string, variantId?: string): string {
    return `${tenantId}:${productId}:${variantId || "default"}`;
  }

  /**
   * Sets initial or updated stock level for a product/variant.
   */
  public setStock(tenantId: string, productId: string, availableQuantity: number, variantId?: string): InventoryRecord {
    const key = this.getStockKey(tenantId, productId, variantId);
    const current = this.inventoryStore.get(key) || {
      productId,
      variantId,
      availableQuantity: 0,
      reservedQuantity: 0,
      soldQuantity: 0,
      lowStockThreshold: 5,
    };

    current.availableQuantity = Math.max(0, availableQuantity);
    this.inventoryStore.set(key, current);
    return current;
  }

  /**
   * Retrieves current inventory record.
   */
  public getStock(tenantId: string, productId: string, variantId?: string): InventoryRecord {
    if (variantId) {
      const variantKey = this.getStockKey(tenantId, productId, variantId);
      if (this.inventoryStore.has(variantKey)) {
        return this.inventoryStore.get(variantKey)!;
      }
    }

    const defaultKey = this.getStockKey(tenantId, productId, undefined);
    return (
      this.inventoryStore.get(defaultKey) || {
        productId,
        variantId,
        availableQuantity: 0,
        reservedQuantity: 0,
        soldQuantity: 0,
        lowStockThreshold: 5,
      }
    );
  }

  /**
   * Atomically reserves stock for a checkout session.
   * Throws OUT_OF_STOCK error if requested quantity > available.
   */
  public reserveStock(params: {
    tenantId: string;
    productId: string;
    variantId?: string;
    cartId: string;
    quantity: number;
    timeoutMinutes?: number;
  }): InventoryReservation {
    let key = this.getStockKey(params.tenantId, params.productId, params.variantId);
    let stock = this.inventoryStore.get(key);

    if (!stock && params.variantId) {
      const fallbackKey = this.getStockKey(params.tenantId, params.productId, undefined);
      if (this.inventoryStore.has(fallbackKey)) {
        key = fallbackKey;
        stock = this.inventoryStore.get(fallbackKey);
      }
    }

    if (!stock || stock.availableQuantity < params.quantity) {
      throw new Error(`OUT_OF_STOCK: Insufficient inventory for product ${params.productId}. Available: ${stock?.availableQuantity || 0}, Requested: ${params.quantity}`);
    }

    // Atomic state transition: AVAILABLE -> RESERVED
    stock.availableQuantity -= params.quantity;
    stock.reservedQuantity += params.quantity;
    this.inventoryStore.set(key, stock);

    const timeout = params.timeoutMinutes ?? 15;
    const expiresAt = new Date(Date.now() + timeout * 60 * 1000).toISOString();
    const reservationId = `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const reservation: InventoryReservation = {
      reservationId,
      productId: params.productId,
      variantId: params.variantId,
      cartId: params.cartId,
      quantity: params.quantity,
      status: "ACTIVE",
      expiresAt,
      createdAt: new Date().toISOString(),
    };

    this.reservations.set(reservationId, reservation);
    return reservation;
  }

  /**
   * Confirms reservation to SOLD on successful verified payment.
   */
  public confirmReservation(tenantId: string, reservationId: string): void {
    const reservation = this.reservations.get(reservationId);
    if (!reservation || reservation.status !== "ACTIVE") return;

    let key = this.getStockKey(tenantId, reservation.productId, reservation.variantId);
    let stock = this.inventoryStore.get(key);

    if (!stock && reservation.variantId) {
      const fallbackKey = this.getStockKey(tenantId, reservation.productId, undefined);
      if (this.inventoryStore.has(fallbackKey)) {
        key = fallbackKey;
        stock = this.inventoryStore.get(fallbackKey);
      }
    }

    if (stock) {
      // Transition: RESERVED -> SOLD
      stock.reservedQuantity = Math.max(0, stock.reservedQuantity - reservation.quantity);
      stock.soldQuantity += reservation.quantity;
      this.inventoryStore.set(key, stock);
    }

    reservation.status = "CONFIRMED";
    this.reservations.set(reservationId, reservation);
  }

  /**
   * Releases reservation back to AVAILABLE if payment fails or expires.
   */
  public releaseReservation(tenantId: string, reservationId: string): void {
    const reservation = this.reservations.get(reservationId);
    if (!reservation || reservation.status !== "ACTIVE") return;

    let key = this.getStockKey(tenantId, reservation.productId, reservation.variantId);
    let stock = this.inventoryStore.get(key);

    if (!stock && reservation.variantId) {
      const fallbackKey = this.getStockKey(tenantId, reservation.productId, undefined);
      if (this.inventoryStore.has(fallbackKey)) {
        key = fallbackKey;
        stock = this.inventoryStore.get(fallbackKey);
      }
    }

    if (stock) {
      // Transition: RESERVED -> AVAILABLE
      stock.reservedQuantity = Math.max(0, stock.reservedQuantity - reservation.quantity);
      stock.availableQuantity += reservation.quantity;
      this.inventoryStore.set(key, stock);
    }

    reservation.status = "RELEASED";
    this.reservations.set(reservationId, reservation);
  }
}

export const inventoryManager = new InventoryManager();
