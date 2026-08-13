import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../migrations/20260813200000_audit_whatsapp_delivery_and_email_cancel.sql", import.meta.url),
  "utf8",
);

assert.match(migration, /AUDIT_DELIVERED/);
assert.match(migration, /status = 'CANCELLED'/);
assert.match(migration, /last_error_safe/);
assert.match(migration, /create table if not exists public\.audit_whatsapp_destinations/i);
assert.match(migration, /CUSTOMER_WHATSAPP_DELIVERY_DESTINATION/);
assert.match(migration, /enable row level security/);
assert.match(migration, /grant select, insert, update, delete on public\.audit_whatsapp_destinations to service_role/);
assert.match(migration, /revoke all on public\.audit_whatsapp_destinations from public, anon/);
const followUp = readFileSync(
  new URL("../migrations/20260813201000_audit_whatsapp_destination_service_role_only.sql", import.meta.url),
  "utf8",
);
assert.match(followUp, /revoke all on public\.audit_whatsapp_destinations from public, anon, authenticated/);
assert.match(migration, /provider_message_id/);
assert.doesNotMatch(migration, /delete from public\.audit_orders/i);
assert.doesNotMatch(migration, /delete from public\.tenants/i);
assert.doesNotMatch(migration, /delete from auth\.users/i);

console.log("audit-ux-completion-migration.test.ts: PASS");
