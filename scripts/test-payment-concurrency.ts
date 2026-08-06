import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Client } from "pg";

const PRODUCTION_PROJECT_REF = "uccqlgeghkwzujeeymua";
const url = process.env.CONCURRENCY_TEST_DATABASE_URL;
if (!url) throw new Error("CONCURRENCY_TEST_DATABASE_URL is required");
if (process.env.ALLOW_PAYMENT_CONCURRENCY_TESTS !== "true") throw new Error("ALLOW_PAYMENT_CONCURRENCY_TESTS=true is required");
if (/prod|production/i.test(process.env.SUPABASE_ENVIRONMENT ?? "")) throw new Error("Production concurrency runs are forbidden");

const parsedUrl = new URL(url);
const host = parsedUrl.hostname.toLowerCase();
const branchId = process.env.SUPABASE_BRANCH_ID?.trim();
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(host);
if (host.includes(PRODUCTION_PROJECT_REF) || branchId === PRODUCTION_PROJECT_REF) {
  throw new Error("Production Supabase project ref is forbidden for concurrency tests");
}
if (!isLocal) {
  if (!branchId) throw new Error("Remote concurrency runs require an isolated SUPABASE_BRANCH_ID");
  if (!host.includes(branchId.toLowerCase())) {
    throw new Error("Remote database hostname must match SUPABASE_BRANCH_ID; setting the variable alone is insufficient");
  }
}

type RaceOutcome<T> = {
  session: "A" | "B";
  backendPid: number;
  readyAt: string;
  result?: T;
  error?: { message: string; code?: string; constraint?: string };
};

const connect = async () => {
  const client = new Client({ connectionString: url, application_name: "payment-concurrency" });
  await client.connect();
  return client;
};

const db = await connect();
const nonce = crypto.randomUUID();

async function race<T>(label: string, sql: string, a: unknown[], b: unknown[]) {
  const clients = await Promise.all([connect(), connect()]);
  const ready = await Promise.all(clients.map(async (client) => {
    await client.query("begin");
    return (await client.query("select pg_backend_pid()::int pid, clock_timestamp()::text ready_at")).rows[0] as { pid: number; ready_at: string };
  }));
  assert.notEqual(ready[0].pid, ready[1].pid);
  const run = async (i: 0 | 1, args: unknown[]): Promise<RaceOutcome<T>> => {
    try {
      const result = (await clients[i].query(sql, args)).rows[0] as T;
      await clients[i].query("commit");
      return { session: i ? "B" : "A", backendPid: ready[i].pid, readyAt: ready[i].ready_at, result };
    } catch (e) {
      await clients[i].query("rollback");
      const error = e as { message?: string; code?: string; constraint?: string };
      return { session: i ? "B" : "A", backendPid: ready[i].pid, readyAt: ready[i].ready_at, error: { message: error.message ?? "unknown database error", code: error.code, constraint: error.constraint } };
    } finally {
      await clients[i].end();
    }
  };
  const startedAt = new Date().toISOString();
  const results = await Promise.all([run(0, a), run(1, b)]);
  console.log(JSON.stringify({ label, startedAt, sessions: results }));
  return results;
}

const successful = <T>(outcome: RaceOutcome<T>): outcome is RaceOutcome<T> & { result: T } => !outcome.error;

let tenant: string | undefined;
const bootstrapUsers: string[] = [];
try {
  tenant = (await db.query("insert into tenants(name,slug) values('Concurrency fixture',$1) returning id", [`concurrency-${nonce}`])).rows[0].id;
  await db.query("insert into wallet_accounts(tenant_id,balance_cents) values($1,0)", [tenant]);

  const event = `evt-${nonce}`;
  const claims = await race<{ result: { claimed: boolean; event_id: string; token?: string } }>(
    "simultaneous webhook claims",
    "select claim_razorpay_webhook_event($1,'payment.captured','{}',60) result",
    [event],
    [event],
  );
  assert.equal(claims.filter((x) => successful(x) && x.result.result.claimed).length, 1);
  const winner = claims.find((x) => successful(x) && x.result.result.claimed);
  assert.ok(winner && successful(winner));
  const eventId = winner.result.result.event_id;
  const token = winner.result.result.token;
  assert.ok(eventId);
  assert.ok(token);
  const completions = await race<{ result: boolean }>(
    "simultaneous webhook completions",
    "select complete_razorpay_webhook_event($1,$2) result",
    [eventId, token],
    [eventId, token],
  );
  assert.equal(completions.filter((x) => successful(x) && x.result.result).length, 1);
  const webhook = (await db.query("select processed_at is not null processed, processing_token is null token_cleared from razorpay_webhook_events where id=$1", [eventId])).rows[0];
  assert.deepEqual(webhook, { processed: true, token_cleared: true });

  const ref = `link-${nonce}`;
  await db.query("insert into payment_links(tenant_id,reference_id,amount_cents,currency,status,payment_purpose,mode) values($1,$2,50000,'INR','created','wallet_topup','test')", [tenant, ref]);
  const fulfillments = await race(
    "simultaneous fulfilment calls",
    "select reconcile_and_fulfill_razorpay_payment_v4($1,$2,'',$3,$4,50000,'INR','captured',true,'payment.captured',clock_timestamp()) result",
    [`fulfil-a-${nonce}`, `pay-${nonce}`, `order-${nonce}`, ref],
    [`fulfil-b-${nonce}`, `pay-${nonce}`, `order-${nonce}`, ref],
  );
  assert.equal(fulfillments.filter(successful).length, 2);
  const fulfil = (await db.query("select (select count(*)::int from payment_orders where reference_id=$1) orders,(select count(*)::int from wallet_ledger_entries where tenant_id=$2 and entry_type='credit_purchase') ledger,(select balance_cents::int from wallet_accounts where tenant_id=$2) balance", [ref, tenant])).rows[0];
  assert.deepEqual(fulfil, { orders: 1, ledger: 1, balance: 50000 });

  const order = (await db.query("select id from payment_orders where reference_id=$1", [ref])).rows[0].id;
  const refund = (await db.query("insert into payment_refunds(tenant_id,payment_order_id,amount_cents,status) values($1,$2,50000,'PENDING') returning id", [tenant, order])).rows[0].id;
  await race(
    "simultaneous same-refund calls",
    "select process_refund_atomic_v11($1,$2,$3,$4,50000,'processed',$5) result",
    [refund, order, `refund-${nonce}`, `pay-${nonce}`, `refund-a-${nonce}`],
    [refund, order, `refund-${nonce}`, `pay-${nonce}`, `refund-b-${nonce}`],
  );
  assert.equal((await db.query("select count(*)::int n from wallet_ledger_entries where tenant_id=$1 and entry_type='refund'", [tenant])).rows[0].n, 1);

  await db.query("update wallet_accounts set balance_cents=1000 where tenant_id=$1", [tenant]);
  const orders = (await db.query("insert into payment_orders(tenant_id,provider,provider_payment_id,amount_cents,currency,state,payment_purpose,mode,reference_type,reference_id) values($1,'razorpay',$2,1000,'INR','CAPTURED','wallet_topup','test','payment_link',$3),($1,'razorpay',$4,1000,'INR','CAPTURED','wallet_topup','test','payment_link',$5) returning id,provider_payment_id", [tenant, `pay-x-${nonce}`, `x-${nonce}`, `pay-y-${nonce}`, `y-${nonce}`])).rows;
  const refunds = (await db.query("insert into payment_refunds(tenant_id,payment_order_id,amount_cents,status) values($1,$2,1000,'PENDING'),($1,$3,1000,'PENDING') returning id,payment_order_id", [tenant, orders[0].id, orders[1].id])).rows;
  const sharedRace = await race<{ result: { status: string } }>(
    "different refunds sharing provider_refund_id",
    "select process_refund_atomic_v11($1,$2,$3,$4,1000,'processed',$5) result",
    [refunds[0].id, orders[0].id, `shared-${nonce}`, orders[0].provider_payment_id, `shared-a-${nonce}`],
    [refunds[1].id, orders[1].id, `shared-${nonce}`, orders[1].provider_payment_id, `shared-b-${nonce}`],
  );
  const shared = (await db.query("select count(*) filter(where status='PROCESSED')::int processed,count(*) filter(where status='MANUAL_REVIEW')::int manual,count(*) filter(where provider_refund_id=$1)::int provider_rows from payment_refunds where id=any($2::uuid[])", [`shared-${nonce}`, refunds.map((r) => r.id)])).rows[0];
  const uniqueErrors = sharedRace.filter((x) => x.error?.code === "23505").length;
  assert.equal(shared.processed, 1);
  assert.ok((shared.manual === 1 && uniqueErrors === 0) || (shared.manual === 0 && uniqueErrors === 1));
  assert.equal(shared.provider_rows <= 1, true);
  assert.equal((await db.query("select count(*)::int n from wallet_ledger_entries where tenant_id=$1 and entry_type='refund' and amount_cents=-1000", [tenant])).rows[0].n, 1);
  assert.equal((await db.query("select balance_cents::int balance from wallet_accounts where tenant_id=$1", [tenant])).rows[0].balance, 0);

  const staff = (await db.query("select count(*)::int n from platform_staff_users where is_active")).rows[0].n;
  if (staff !== 0) throw new Error("bootstrap race requires an isolated database with zero active platform staff");
  bootstrapUsers.push(crypto.randomUUID(), crypto.randomUUID());
  await db.query("insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values($1,'authenticated','authenticated',$2,now(),'{}','{}'),($3,'authenticated','authenticated',$4,now(),'{}','{}')", [bootstrapUsers[0], `a-${nonce}@example.invalid`, bootstrapUsers[1], `b-${nonce}@example.invalid`]);
  const bootstraps = await race<{ result: { success: boolean } }>(
    "simultaneous first-platform-staff bootstrap",
    "select bootstrap_first_platform_staff($1,$1,'platform_owner') result",
    [bootstrapUsers[0]],
    [bootstrapUsers[1]],
  );
  assert.equal(bootstraps.filter((x) => successful(x) && x.result.result.success).length, 1);
  assert.equal(bootstraps.filter((x) => !successful(x) || !x.result.result.success).length, 1);
  assert.equal((await db.query("select count(*)::int n from platform_staff_users where is_active and role='platform_owner'")).rows[0].n, 1);
  assert.equal((await db.query("select count(*)::int n from platform_admin_events where action='assign_platform_staff' and target_user_id = any($1::uuid[])", [bootstrapUsers])).rows[0].n, 1);

  console.log(JSON.stringify({ finalRowCounts: { webhook: 1, paymentOrders: 1, fulfilmentLedger: 1, refundLedger: 1, sharedProviderRefundProcessed: 1, activePlatformStaff: 1 } }));
} finally {
  if (bootstrapUsers.length) {
    await db.query("delete from platform_admin_events where target_user_id=any($1::uuid[])", [bootstrapUsers]).catch(() => {});
    await db.query("delete from platform_staff_users where user_id=any($1::uuid[])", [bootstrapUsers]);
    await db.query("delete from auth.users where id=any($1::uuid[])", [bootstrapUsers]);
  }
  if (tenant) await db.query("delete from tenants where id=$1", [tenant]);
  await db.query("delete from razorpay_webhook_events where provider_event_id=$1", [`evt-${nonce}`]);
  await db.end();
}
