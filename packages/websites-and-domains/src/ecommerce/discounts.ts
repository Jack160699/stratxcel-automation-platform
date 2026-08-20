/**
 * Discount & Promotion Engine
 *
 * Enforces server-side discount calculation, usage limits, minimum spend,
 * and expiration boundaries (never trusts client discount claims).
 */

import type { DiscountRule } from "./types.ts";

export class DiscountManager {
  private discounts: Map<string, DiscountRule> = new Map();

  private getDiscountKey(tenantId: string, code: string): string {
    return `${tenantId}:${code.toUpperCase().trim()}`;
  }

  /**
   * Registers a discount rule.
   */
  public createDiscount(
    params: Omit<DiscountRule, "id" | "usesCount" | "startsAt"> & { startsAt?: string }
  ): DiscountRule {
    const id = `disc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const rule: DiscountRule = {
      ...params,
      id,
      code: params.code.toUpperCase().trim(),
      startsAt: params.startsAt || new Date().toISOString(),
      usesCount: 0,
    };

    const key = this.getDiscountKey(params.tenantId, rule.code);
    this.discounts.set(key, rule);
    return rule;
  }

  /**
   * Validates a discount code against a cart subtotal.
   * Returns calculated discount amount in cents.
   */
  public evaluateDiscount(params: {
    tenantId: string;
    code: string;
    subtotalCents: number;
    siteProjectId?: string;
  }): { valid: boolean; discountCents: number; message?: string } {
    const key = this.getDiscountKey(params.tenantId, params.code);
    const discount = this.discounts.get(key);

    if (!discount || !discount.isActive) {
      return { valid: false, discountCents: 0, message: "Invalid or inactive discount code" };
    }

    if (discount.siteProjectId && params.siteProjectId && discount.siteProjectId !== params.siteProjectId) {
      return { valid: false, discountCents: 0, message: "Discount not applicable to this store" };
    }

    if (discount.expiresAt && new Date(discount.expiresAt) < new Date()) {
      return { valid: false, discountCents: 0, message: "Discount code has expired" };
    }

    if (discount.maxUses !== undefined && discount.usesCount >= discount.maxUses) {
      return { valid: false, discountCents: 0, message: "Discount code usage limit reached" };
    }

    if (params.subtotalCents < discount.minCartValueCents) {
      return {
        valid: false,
        discountCents: 0,
        message: `Minimum cart value of ₹${(discount.minCartValueCents / 100).toFixed(2)} required`,
      };
    }

    let discountCents = 0;
    if (discount.type === "PERCENTAGE") {
      discountCents = Math.round((params.subtotalCents * discount.value) / 100);
    } else {
      discountCents = Math.min(params.subtotalCents, Math.round(discount.value));
    }

    return { valid: true, discountCents };
  }

  /**
   * Records a discount usage.
   */
  public recordUsage(tenantId: string, code: string): void {
    const key = this.getDiscountKey(tenantId, code);
    const discount = this.discounts.get(key);
    if (discount) {
      discount.usesCount += 1;
      this.discounts.set(key, discount);
    }
  }
}

export const discountManager = new DiscountManager();
