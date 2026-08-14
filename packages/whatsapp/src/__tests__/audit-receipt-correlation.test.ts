// Run with: node --experimental-strip-types packages/whatsapp/src/__tests__/audit-receipt-correlation.test.ts
import assert from "node:assert/strict";
import { updateAuditDeliveryEventStatus } from "../messages.ts";
import type { ServiceClient } from "../db.ts";

interface MockDeliveryRow {
  id: string;
  audit_order_id: string;
  tenant_id: string;
  status: string;
  provider_message_id: string;
  detail: string;
}

function createMockSupabase(initialRows: MockDeliveryRow[] = []) {
  const rows = [...initialRows];

  return {
    from(table: string) {
      assert.equal(table, "audit_delivery_events");
      let selectedProviderId: string | null = null;
      let updatePayload: Partial<MockDeliveryRow> | null = null;
      let targetId: string | null = null;

      const queryBuilder = {
        select(_cols: string) {
          return queryBuilder;
        },
        eq(col: string, val: string) {
          if (col === "provider_message_id") selectedProviderId = val;
          if (col === "id") targetId = val;
          return queryBuilder;
        },
        async maybeSingle() {
          const match = rows.find((r) => r.provider_message_id === selectedProviderId);
          return { data: match ? { id: match.id, status: match.status } : null, error: null };
        },
        update(payload: Partial<MockDeliveryRow>) {
          updatePayload = payload;
          return {
            eq(col: string, val: string) {
              if (col === "id") {
                const idx = rows.findIndex((r) => r.id === val);
                if (idx >= 0 && updatePayload) {
                  rows[idx] = { ...rows[idx]!, ...updatePayload };
                }
              }
              return { error: null };
            },
          };
        },
      };

      return queryBuilder;
    },
    getRows() {
      return rows;
    },
  };
}

async function run() {
  const initialRow: MockDeliveryRow = {
    id: "event_123",
    audit_order_id: "order_abc",
    tenant_id: "tenant_xyz",
    status: "sent",
    provider_message_id: "wamid.HBgL...",
    detail: "provider_accepted",
  };

  const mockDb = createMockSupabase([initialRow]);

  // 1. Deliver event updates status to 'delivered'
  const result1 = await updateAuditDeliveryEventStatus(mockDb as unknown as ServiceClient, {
    providerMessageId: "wamid.HBgL...",
    status: "delivered",
  });
  assert.equal(result1.success, true);
  assert.equal(result1.updated, true);
  assert.equal(mockDb.getRows()[0]?.status, "delivered");
  assert.equal(mockDb.getRows()[0]?.detail, "provider_receipt:delivered");

  // 2. Out-of-order 'sent' receipt does not regress status from 'delivered'
  const result2 = await updateAuditDeliveryEventStatus(mockDb as unknown as ServiceClient, {
    providerMessageId: "wamid.HBgL...",
    status: "sent",
  });
  assert.equal(result2.success, true);
  assert.equal(result2.updated, false);
  assert.equal(result2.reason, "stale_status");
  assert.equal(mockDb.getRows()[0]?.status, "delivered");

  // 3. Unknown provider_message_id returns not_found without throwing
  const result3 = await updateAuditDeliveryEventStatus(mockDb as unknown as ServiceClient, {
    providerMessageId: "wamid.unknown",
    status: "delivered",
  });
  assert.equal(result3.success, true);
  assert.equal(result3.updated, false);
  assert.equal(result3.reason, "not_found");

  console.log("audit-receipt-correlation.test.ts: ALL PASS");
}

run();
