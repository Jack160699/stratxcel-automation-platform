export interface CreateOrderResult {
  orderId: string;
  amountCents: number;
  currency: string;
  mode: "shadow" | "live";
}

export interface PaymentsAdapter {
  readonly mode: "disabled" | "shadow" | "live";
  createOrder(input: { tenantId: string; amountCents: number; currency?: string; receipt?: string }): Promise<CreateOrderResult>;
}
