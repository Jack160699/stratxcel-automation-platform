/**
 * E2E safety mocks — only external mutation / expensive providers.
 * No real customer-visible mutation.
 */

export type MockMutationKind =
  | "social_publish"
  | "whatsapp_send"
  | "ads_publish"
  | "website_deploy"
  | "payment_charge";

export interface MockMutationReceipt {
  kind: MockMutationKind;
  requestId: string;
  status: "simulated";
  tenantId: string;
  missionId: string;
  atIso: string;
  realMutation: false;
  payload: Record<string, unknown>;
}

export interface MutationMockBus {
  receipts: MockMutationReceipt[];
  simulate(kind: MockMutationKind, input: {
    tenantId: string;
    missionId: string;
    payload?: Record<string, unknown>;
  }): MockMutationReceipt;
  assertNoRealMutation(): void;
}

export function createMutationMockBus(): MutationMockBus {
  const receipts: MockMutationReceipt[] = [];
  return {
    receipts,
    simulate(kind, input) {
      const receipt: MockMutationReceipt = {
        kind,
        requestId: `mock_${kind}_${receipts.length + 1}`,
        status: "simulated",
        tenantId: input.tenantId,
        missionId: input.missionId,
        atIso: new Date().toISOString(),
        realMutation: false,
        payload: input.payload ?? {},
      };
      receipts.push(receipt);
      return receipt;
    },
    assertNoRealMutation() {
      for (const r of receipts) {
        if (r.realMutation !== false || r.status !== "simulated") {
          throw new Error("real_customer_visible_mutation_detected");
        }
      }
    },
  };
}
