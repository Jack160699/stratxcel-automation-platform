// Verifies the safety-critical default: with no _INTEGRATION_MODE env var
// set, sendMessage refuses to run at all rather than silently doing
// something. The fake client is never touched in this path — disabled
// mode never reaches the database.
// Run with: node --experimental-strip-types lib/integrations/whatsapp/__tests__/adapter.test.ts
import assert from "node:assert/strict";
import type { createSupabaseServiceClient } from "../../../supabase/service.ts";
import { createWhatsAppAdapter } from "../adapter.ts";
import { IntegrationDisabledError } from "../types.ts";

async function run() {
  delete process.env.WHATSAPP_INTEGRATION_MODE;
  const fakeClient = {} as ReturnType<typeof createSupabaseServiceClient>;

  const adapter = createWhatsAppAdapter(fakeClient);
  assert.equal(adapter.mode, "disabled");

  await assert.rejects(
    () => adapter.sendMessage({ tenantId: "t1", to: "919999999999", body: "hi" }),
    IntegrationDisabledError
  );

  console.log("adapter.test.ts (whatsapp): ALL PASS");
}

run();
