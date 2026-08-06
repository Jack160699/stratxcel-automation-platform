import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Client } from "pg";

const url = process.env.CONCURRENCY_TEST_DATABASE_URL;
if (!url) throw new Error("CONCURRENCY_TEST_DATABASE_URL is required");
if (process.env.ALLOW_PAYMENT_CONCURRENCY_TESTS !== "true") throw new Error("ALLOW_PAYMENT_CONCURRENCY_TESTS=true is required");
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host) && !process.env.SUPABASE_BRANCH_ID) {
  throw new Error("Remote runs require an isolated SUPABASE_BRANCH_ID; production is forbidden");
}
if (/prod/i.test(process.env.SUPABASE_ENVIRONMENT ?? "")) throw new Error("Production concurrency runs are forbidden");

const connect = async () => { const c = new Client({ connectionString: url, application_name: "payment-concurrency" }); await c.connect(); return c; };
const db = await connect();
const nonce = crypto.randomUUID();

async function race(label: string, sql: string, a: unknown[], b: unknown[]) {
  const clients = await Promise.all([connect(), connect()]);
  const meta = await Promise.all(clients.map(async (c) => {
    await c.query("begin");
    return (await c.query("select pg_backend_pid() pid, clock_timestamp()::text started")).rows[0];
  }));
  assert.notEqual(meta[0].pid, meta[1].pid);
  const release = new Date().toISOString();
  const run = async (i: number, args: unknown[]) => {
    try {
      const result = (await clients[i].query(sql, args)).rows[0];
      await clients[i].query("commit");
      return { session: i ? "B" : "A", backendPid: meta[i].pid, transactionStart: meta[i].started, releaseBarrier: release, result };
    } catch (e) { await clients[i].query("rollback"); throw e; }
    finally { await clients[i].end(); }
  };
  const results = await Promise.all([run(0, a), run(1, b)]);
  console.log(JSON.stringify({ label, sessions: results }));
  return results;
}

let tenant: string | undefined;
const bootstrapUsers: string[] = [];
try {
  tenant = (await db.query("insert into tenants(name,slug) values('Concurrency fixture',$1) returning id", [`concurrency-${nonce}`])).rows[0].id;
  await db.query("insert into wallet_accounts(tenant_id,balance_cents) values($1,0)", [tenant]);

  const event = `evt-${nonce}`;
  const claims = await race("simultaneous webhook claims", "select claim_razorpay_webhook_event($1,'payment.captured','{}',60) result", [event], [event]);
  assert.equal(claims.filter((x) => x.result.result.claimed).length, 1);
  assert.equal((await db.query("select count(*)::int n from razorpay_webhook_events where provider_event_id=$1", [event])).rows[0].n, 1);

  const ref = `link-${nonce}`;
  await db.query("insert into payment_links(tenant_id,reference_id,amount_cents,currency,status,payment_purpose,mode) values($1,$2,50000,'INR','created','wallet_topup','test')", [tenant, ref]);
  await race(
    "simultaneous fulfilment calls",
    "select reconcile_and_fulfill_razorpay_payment_v4($1,$2,'',$3,$4,50000,'INR','captured',true,'payment.captured',clock_timestamp()) result",
    [`fulfil-a-${nonce}`, `pay-${nonce}`, `order-${nonce}`, ref],
    [`fulfil-b-${nonce}`, `pay-${nonce}`, `order-${nonce}`, ref],
  );
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

  const orders = (await db.query("insert into payment_orders(tenant_id,provider,provider_payment_id,amount_cents,currency,state,payment_purpose,mode,reference_type,reference_id) values($1,'razorpay',$2,1000,'INR','CAPTURED','wallet_topup','test','payment_link',$3),($1,'razorpay',$4,1000,'INR','CAPTURED','wallet_topup','test','payment_link',$5) returning id,provider_payment_id", [tenant, `pay-x-${nonce}`, `x-${nonce}`, `pay-y-${nonce}`, `y-${nonce}`])).rows;
  const refunds = (await db.query("insert into payment_refunds(tenant_id,payment_order_id,amount_cents,status) values($1,$2,1000,'PENDING'),($1,$3,1000,'PENDING') returning id,payment_order_id", [tenant, orders[0].id, orders[1].id])).rows;
  await race(
    "different refunds sharing provider_refund_id",
    "select process_refund_atomic_v11($1,$2,$3,$4,1000,'processed',$5) result",
    [refunds[0].id, orders[0].id, `shared-${nonce}`, orders[0].provider_payment_id, `shared-a-${nonce}`],
    [refunds[1].id, orders[1].id, `shared-${nonce}`, orders[1].provider_payment_id, `shared-b-${nonce}`],
  );
  const shared = (await db.query("select count(*) filter(where status='PROCESSED')::int processed,count(*) filter(where status='MANUAL_REVIEW')::int manual from payment_refunds where id=any($1::uuid[])", [refunds.map((r) => r.id)])).rows[0];
  assert.deepEqual(shared, { processed: 1, manual: 1 });

  const staff = (await db.query("select count(*)::int n from platform_staff_users where is_active")).rows[0].n;
  if (staff !== 0) throw new Error("bootstrap race requires an isolated Supabase branch with zero active platform staff");
  bootstrapUsers.push(crypto.randomUUID(), crypto.randomUUID());
  await db.query("insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values($1,'authenticated','authenticated',$2,now(),'{}','{}'),($3,'authenticated','authenticated',$4,now(),'{}','{}')", [bootstrapUsers[0], `a-${nonce}@example.invalid`, bootstrapUsers[1], `b-${nonce}@example.invalid`]);
  await race("simultaneous first-platform-staff bootstrap", "select bootstrap_first_platform_staff($1,$1,'platform_owner') result", [bootstrapUsers[0]], [bootstrapUsers[1]]);
  assert.equal((await db.query("select count(*)::int n from platform_staff_users where is_active")).rows[0].n, 1);

  console.log(JSON.stringify({ finalRowCounts: { webhook: 1, paymentOrders: 1, fulfilmentLedger: 1, refundLedger: 1, sharedProviderRefundProcessed: 1, activePlatformStaff: 1 } }));
} finally {
  if (bootstrapUsers.length) {
    await db.query("delete from platform_admin_events where target_user_id=any($1::uuid[])", [bootstrapUsers]);
    await db.query("delete from platform_staff_users where user_id=any($1::uuid[])", [bootstrapUsers]);
    await db.query("delete from auth.users where id=any($1::uuid[])", [bootstrapUsers]);
  }
  if (tenant) await db.query("delete from tenants where id=$1", [tenant]);
  await db.query("delete from razorpay_webhook_events where provider_event_id=$1", [`evt-${nonce}`]);
  await db.end();
}
