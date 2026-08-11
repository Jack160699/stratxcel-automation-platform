// Run with: node --experimental-strip-types supabase/__tests__/email-outbox-migration.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.join(__dirname, "../migrations/20260813120000_transactional_email_outbox.sql");

function run() {
  const sql = fs.readFileSync(migrationPath, "utf8");

  assert.ok(sql.includes("create table if not exists public.email_outbox"));
  for (const col of [
    "tenant_id",
    "owner_id",
    "event_type",
    "recipient",
    "recipient_hash",
    "template_key",
    "template_version",
    "subject",
    "payload",
    "idempotency_key",
    "provider",
    "provider_message_id",
    "status",
    "attempt_count",
    "next_attempt_at",
    "last_attempt_at",
    "last_error_code",
    "last_error_safe",
    "sent_at",
    "created_at",
    "updated_at",
  ]) {
    assert.ok(sql.includes(col), `missing column ${col}`);
  }

  for (const status of ["PENDING", "PROCESSING", "SENT", "RETRY_WAIT", "FAILED", "CANCELLED", "WAITING_CONFIGURATION"]) {
    assert.ok(sql.includes(`'${status}'`), `missing status ${status}`);
  }

  assert.ok(sql.includes("alter table public.email_outbox enable row level security"));
  assert.ok(!/create policy .+ on public\.email_outbox for insert/i.test(sql), "clients must not insert into email_outbox");
  assert.ok(!/grant insert on table public\.email_outbox to authenticated/i.test(sql));
  assert.ok(!/grant insert on table public\.email_outbox to anon/i.test(sql));

  // Tenant A cannot read tenant B via direct grants — no authenticated select grant.
  assert.ok(!/grant select on table public\.email_outbox to authenticated/i.test(sql));

  console.log("email-outbox-migration.test.ts: ALL PASS");
}

run();
