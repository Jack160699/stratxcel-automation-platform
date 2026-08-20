/**
 * E-Commerce Domain Types & Contracts
 */

export type ProductStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export type OrderStatus =
  | "PAYMENT_PENDING"
  | "PAID"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "REFUNDED"
  | "PAYMENT_FAILED"
  | "PAYMENT_EXPIRED";

export type RefundStatus =
  | "REQUESTED"
  | "APPROVED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "REJECTED";

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  title: string;
  options: Record<string, string>; // e.g. { size: "XL", color: "Black" }
  priceOverrideCents?: number;
  isActive: boolean;
}

export interface Product {
  id: string;
  tenantId: string;
  siteProjectId?: string;
  categoryId?: string;
  collectionId?: string;
  name: string;
  slug: string;
  description: string;
  shortDescription?: string;
  status: ProductStatus;
  brand?: string;
  tags: string[];
  sku?: string;
  priceCents: number;
  compareAtPriceCents?: number;
  currency: string;
  taxRatePercentage: number;
  images: Array<{ url: string; altText?: string; isPrimary?: boolean }>;
  variants: ProductVariant[];
  seo?: { title?: string; description?: string };
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  tenantId: string;
  siteProjectId?: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  isActive: boolean;
  sortOrder: number;
}

export interface Collection {
  id: string;
  tenantId: string;
  siteProjectId?: string;
  title: string;
  slug: string;
  description?: string;
  bannerImageUrl?: string;
  isActive: boolean;
}

export interface InventoryRecord {
  productId: string;
  variantId?: string;
  availableQuantity: number;
  reservedQuantity: number;
  soldQuantity: number;
  lowStockThreshold: number;
}

export interface InventoryReservation {
  reservationId: string;
  productId: string;
  variantId?: string;
  cartId: string;
  quantity: number;
  status: "ACTIVE" | "CONFIRMED" | "RELEASED" | "EXPIRED";
  expiresAt: string;
  createdAt: string;
}

export interface CartItem {
  productId: string;
  variantId?: string;
  quantity: number;
  productName: string;
  variantTitle?: string;
  unitPriceCents: number;
  image?: string;
}

export interface CartSummary {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
  currency: string;
  appliedDiscountCode?: string;
}

export interface Cart {
  id: string;
  tenantId: string;
  siteProjectId?: string;
  customerId?: string;
  sessionToken: string;
  currency: string;
  discountCode?: string;
  items: CartItem[];
  summary: CartSummary;
  expiresAt: string;
  updatedAt: string;
}

export interface DiscountRule {
  id: string;
  tenantId: string;
  siteProjectId?: string;
  code: string;
  type: "PERCENTAGE" | "FIXED_AMOUNT";
  value: number; // e.g. 15 for 15% or 50000 for ₹500 (50000 cents)
  minCartValueCents: number;
  maxUses?: number;
  usesCount: number;
  startsAt: string;
  expiresAt?: string;
  isActive: boolean;
}

export interface OrderItem {
  productId: string;
  variantId?: string;
  productName: string;
  variantTitle?: string;
  sku?: string;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
}

export interface Order {
  id: string;
  tenantId: string;
  siteProjectId?: string;
  customerId?: string;
  guestEmail?: string;
  guestPhone?: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
  currency: string;
  paymentProvider: "razorpay";
  providerOrderId?: string;
  providerPaymentId?: string;
  paymentStatus: "PENDING" | "PAID" | "FAILED" | "REFUNDED";
  shippingAddress: Record<string, string>;
  billingAddress: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface RefundRecord {
  id: string;
  tenantId: string;
  orderId: string;
  amountCents: number;
  reason?: string;
  status: RefundStatus;
  providerRefundId?: string;
  actorUserId?: string;
  createdAt: string;
  updatedAt: string;
}
