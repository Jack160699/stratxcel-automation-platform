// Instagram campaign status truthfulness and paced publishing safety.
// Run with: node --experimental-strip-types lib/social/__tests__/instagram-campaign.test.ts
import assert from "node:assert/strict";
import {
  deriveCampaignItemStatus,
  isInstagramFeedAspectRatio,
  maskProviderError,
  summarizeCampaignItems,
  type InstagramCampaignItemSpec,
} from "../instagram-campaign.ts";
import { publishNextCampaignItem, type CampaignPublisherDeps } from "../instagram-campaign-publisher.ts";

console.log("Running Instagram campaign tests...\n");

const DBS_TENANT = "tenant-dbs";
const SX_TENANT = "tenant-sx";
const DBS_IG = "17841429966566939";
const SX_IG = "17841480038460404";
const CAMPAIGN = "campaign-dbs-45";

function spec(overrides: Partial<InstagramCampaignItemSpec> = {}): InstagramCampaignItemSpec {
  return {
    campaign_id: CAMPAIGN,
    campaign_key: "dbs_45post_campaign",
    sequence: 1,
    asset_id: "asset-1",
    asset_name: "day-01-bill-shock-feed.jpg",
    width: 1080,
    height: 1350,
    format_status: "FEED_ELIGIBLE",
    claim_review: { status: "CLEARED", reasons: [] },
    headline: "₹6,000 Ka Bijli Bill?",
    cta_type: "website",
    hashtag_group: "Local",
    dedupe_marker: "utm_content=day-01-bill-shock",
    expected_provider_account_id: DBS_IG,
    platform_limit: null,
    ...overrides,
  };
}

// 1. Feed format eligibility uses Instagram's real 4:5 .. 1.91:1 range.
{
  assert.equal(isInstagramFeedAspectRatio(1080, 1350), true);
  assert.equal(isInstagramFeedAspectRatio(1080, 1080), true);
  assert.equal(isInstagramFeedAspectRatio(1080, 566), true);
  assert.equal(isInstagramFeedAspectRatio(1080, 1920), false, "9:16 is not a feed post");
  assert.equal(isInstagramFeedAspectRatio(0, 1350), false);
  console.log("  ok  feed aspect-ratio classification");
}

// 2. Status is derived from facts plus the real job -- never a stored claim.
{
  assert.equal(deriveCampaignItemStatus(spec({ format_status: "FORMAT_INELIGIBLE_FOR_INSTAGRAM_FEED", width: 1080, height: 1920 }), null).status, "FORMAT_INELIGIBLE_FOR_INSTAGRAM_FEED");
  assert.equal(deriveCampaignItemStatus(spec({ claim_review: { status: "HOLD", reasons: ["unsupported 90% figure"] } }), null).status, "BLOCKED_CLAIM_REVIEW");
  assert.equal(deriveCampaignItemStatus(spec(), null).status, "NOT_ATTEMPTED");
  assert.equal(deriveCampaignItemStatus(spec({ platform_limit: { blocked_at: "2026-09-17T00:00:00Z", quota_usage: 100, quota_total: 100 } }), null).status, "BLOCKED_BY_PLATFORM_LIMIT");
  assert.equal(deriveCampaignItemStatus(spec(), { status: "SCHEDULED", scheduled_at: "2026-09-18T04:00:00Z", completed_at: null, last_error: null, result: null }).status, "SCHEDULED");

  const live = deriveCampaignItemStatus(spec(), {
    status: "PUBLISHED", scheduled_at: null, completed_at: "2026-09-17T01:00:00Z", last_error: null,
    result: { mode: "live", external_post_id: "18000000001", permalink: "https://www.instagram.com/p/x/", provider_verification: { verified: true, timestamp: "2026-09-17T01:00:05+0000" } },
  });
  assert.equal(live.status, "PUBLISHED");
  assert.equal(live.mediaId, "18000000001");
  assert.equal(live.providerVerified, true);

  const shadow = deriveCampaignItemStatus(spec(), { status: "PUBLISHED", scheduled_at: null, completed_at: null, last_error: null, result: { mode: "shadow", external_post_id: "SHADOW-key" } });
  assert.equal(shadow.status, "NOT_ATTEMPTED", "a shadow simulation must never read as published");

  const failed = deriveCampaignItemStatus(spec(), { status: "FAILED", scheduled_at: null, completed_at: null, last_error: "Instagram publish: bad https://graph.instagram.com/x?access_token=IGAAsecretsecretsecret123", result: null });
  assert.equal(failed.status, "FAILED");
  assert.ok(failed.detail && !failed.detail.includes("IGAAsecret"), "failure detail must not carry a token");
  console.log("  ok  status derivation is truthful (shadow != published, errors masked)");
}

// 3. Summary counts match a 45-asset campaign shape.
{
  const statuses = [
    ...Array.from({ length: 6 }, () => deriveCampaignItemStatus(spec({ format_status: "FORMAT_INELIGIBLE_FOR_INSTAGRAM_FEED" }), null)),
    ...Array.from({ length: 7 }, () => deriveCampaignItemStatus(spec({ claim_review: { status: "HOLD", reasons: ["x"] } }), null)),
    ...Array.from({ length: 30 }, () => deriveCampaignItemStatus(spec(), { status: "PUBLISHED", scheduled_at: null, completed_at: null, last_error: null, result: { mode: "live", external_post_id: "1", provider_verification: { verified: true } } })),
    ...Array.from({ length: 2 }, () => deriveCampaignItemStatus(spec(), { status: "FAILED", scheduled_at: null, completed_at: null, last_error: "x", result: null })),
  ];
  const s = summarizeCampaignItems(statuses);
  assert.deepEqual(
    [s.total, s.feedEligible, s.formatIneligible, s.published, s.providerVerified, s.blocked, s.blockedClaimReview, s.failed, s.scheduled, s.notAttempted],
    [45, 39, 6, 30, 30, 7, 7, 2, 0, 0]
  );
  assert.equal(maskProviderError("x access_token=EAAbcdefghijklmnopqrstu y"), "x access_token=[redacted] y");
  console.log("  ok  campaign summary counts");
}

// ---- Paced publisher with an in-memory database ----

type Row = Record<string, any>;

function createDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  const log = { inserts: [] as Array<[string, Row]>, updates: [] as Array<[string, Row]> };
  let seq = 0;

  function query(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let op: "select" | "update" | "insert" = "select";
    let patch: Row = {};
    let inserted: Row | null = null;
    const rows = () => (tables[table] ??= []);
    const run = () => {
      if (op === "insert") return inserted ? [inserted] : [];
      const matched = rows().filter((r) => filters.every((f) => f(r)));
      if (op === "update") matched.forEach((r) => Object.assign(r, patch));
      return matched;
    };
    const builder: any = {
      select() { return builder; },
      eq(col: string, val: unknown) { filters.push((r) => r[col] === val); return builder; },
      in(col: string, vals: unknown[]) { filters.push((r) => vals.includes(r[col])); return builder; },
      not(col: string, _op: string, _val: unknown) { filters.push((r) => r[col] !== null && r[col] !== undefined); return builder; },
      order() { return builder; },
      limit() { return builder; },
      update(p: Row) { op = "update"; patch = p; log.updates.push([table, p]); return builder; },
      insert(r: Row) { op = "insert"; inserted = { id: `${table}-${++seq}`, created_at: new Date(Date.now() + seq).toISOString(), ...r }; rows().push(inserted); log.inserts.push([table, inserted]); return builder; },
      async maybeSingle() { const m = run(); return { data: m[0] ?? null, error: null }; },
      async single() { const m = run(); return m[0] ? { data: m[0], error: null } : { data: null, error: { message: "no row" } }; },
      then(resolve: (v: unknown) => unknown) { return resolve({ data: run(), error: null }); },
    };
    return builder;
  }
  return { service: { from: query } as any, tables, log };
}

function seed(overrides: { dbsAccount?: Partial<Row>; settings?: Row[]; variants?: Row[]; jobs?: Row[] } = {}) {
  return {
    social_accounts: [
      { id: "acct-dbs", owner_id: "owner-dbs", tenant_id: DBS_TENANT, platform: "instagram", provider_account_id: DBS_IG, username: "@durgsolar", status: "CONNECTED", token_health: "HEALTHY", ...overrides.dbsAccount },
      { id: "acct-sx", owner_id: "owner-sx", tenant_id: SX_TENANT, platform: "instagram", provider_account_id: SX_IG, username: "@stratxcel.in", status: "CONNECTED", token_health: "HEALTHY" },
    ],
    social_automation_settings: overrides.settings ?? [{ owner_id: "owner-dbs", shadow_mode: false }],
    content_master: [
      { id: "m1", tenant_id: DBS_TENANT, campaign_id: CAMPAIGN },
      { id: "m2", tenant_id: DBS_TENANT, campaign_id: CAMPAIGN },
      { id: "m3", tenant_id: DBS_TENANT, campaign_id: CAMPAIGN },
      { id: "m4", tenant_id: DBS_TENANT, campaign_id: CAMPAIGN },
    ],
    content_variants: overrides.variants ?? [
      { id: "v-ineligible", master_id: "m1", platform: "instagram", caption: "story", creative_spec: spec({ sequence: 1, format_status: "FORMAT_INELIGIBLE_FOR_INSTAGRAM_FEED", dedupe_marker: "utm_content=story" }) },
      { id: "v-held", master_id: "m2", platform: "instagram", caption: "held", creative_spec: spec({ sequence: 2, claim_review: { status: "HOLD", reasons: ["90%"] }, dedupe_marker: "utm_content=held" }) },
      { id: "v-a", master_id: "m3", platform: "instagram", caption: "A caption utm_content=post-a", creative_spec: spec({ sequence: 3, asset_name: "post-a.jpg", dedupe_marker: "utm_content=post-a" }) },
      { id: "v-b", master_id: "m4", platform: "instagram", caption: "B caption utm_content=post-b", creative_spec: spec({ sequence: 4, asset_name: "post-b.jpg", dedupe_marker: "utm_content=post-b" }) },
    ],
    social_publishing_jobs: overrides.jobs ?? [],
  };
}

function deps(db: ReturnType<typeof createDb>, overrides: Partial<CampaignPublisherDeps> = {}) {
  const calls = { runJob: [] as string[], tokenFor: [] as string[], audits: [] as string[] };
  const d: CampaignPublisherDeps = {
    async getAccessToken(account) { calls.tokenFor.push(account.id); return "token-for-" + account.id; },
    async fetchPublishingLimit() { return { quotaUsage: 3, quotaTotal: 100, quotaDurationSeconds: 86400 }; },
    async listRecentMedia() { return []; },
    async fetchMedia(_token, mediaId) { return { id: mediaId, username: "durgsolar", timestamp: "2026-09-17T02:00:00+0000", permalink: "https://www.instagram.com/p/abc/" }; },
    async runJob(jobId) {
      calls.runJob.push(jobId);
      const job = db.tables.social_publishing_jobs.find((j) => j.id === jobId)!;
      Object.assign(job, { status: "PUBLISHED", completed_at: "2026-09-17T02:00:06Z", result: { mode: "live", external_post_id: "18099999999" } });
    },
    async audit(entry) { calls.audits.push(entry.action); },
    now: () => new Date("2026-09-17T02:00:00Z"),
    ...overrides,
  };
  return { d, calls };
}

const input = { tenantId: DBS_TENANT, campaignId: CAMPAIGN, actorUserId: "staff-1" };

// 4. Disconnected tenant connection: nothing happens, and the other tenant's healthy account is never used.
{
  const db = createDb(seed({ dbsAccount: { status: "DISCONNECTED", token_health: "REVOKED" } }));
  const { d, calls } = deps(db);
  const step = await publishNextCampaignItem(db.service, input, d);
  assert.equal(step.outcome, "connection_not_ready");
  assert.equal(calls.runJob.length, 0);
  assert.deepEqual(calls.tokenFor, [], "no token may be read -- least of all @stratxcel.in's");
  assert.equal(db.log.inserts.length, 0);
  console.log("  ok  disconnected DBS connection blocks publishing; corporate account never touched");
}

// 5. Tenant row re-pointed at another account: rejected by the item's binding.
{
  const db = createDb(seed({ dbsAccount: { provider_account_id: SX_IG, username: "@stratxcel.in" } }));
  const { d, calls } = deps(db);
  const step = await publishNextCampaignItem(db.service, input, d);
  assert.equal(step.outcome, "account_mismatch");
  assert.equal(calls.runJob.length + calls.tokenFor.length + db.log.inserts.length, 0);
  console.log("  ok  campaign item bound to @durgsolar refuses any other Instagram account");
}

// 6. Shadow mode (no settings row): refuses rather than simulating a "publish".
{
  const db = createDb(seed({ settings: [] }));
  const { d, calls } = deps(db);
  const step = await publishNextCampaignItem(db.service, input, d);
  assert.equal(step.outcome, "shadow_mode");
  assert.equal(calls.runJob.length, 0);
  console.log("  ok  shadow mode refuses instead of simulating");
}

// 7. Quota exhausted: nothing published, every remaining publishable item marked BLOCKED_BY_PLATFORM_LIMIT.
{
  const db = createDb(seed());
  const { d, calls } = deps(db, { async fetchPublishingLimit() { return { quotaUsage: 100, quotaTotal: 100, quotaDurationSeconds: 86400 }; } });
  const step = await publishNextCampaignItem(db.service, input, d);
  assert.equal(step.outcome, "blocked_by_platform_limit");
  assert.equal(calls.runJob.length, 0);
  const marked = db.tables.content_variants.filter((v) => v.creative_spec.platform_limit);
  assert.deepEqual(marked.map((v) => v.id).sort(), ["v-a", "v-b"], "only eligible, cleared items are marked -- never held or ineligible ones");
  assert.equal(db.tables.social_publishing_jobs.length, 0);
  console.log("  ok  platform limit blocks and marks remaining items truthfully");
}

// 8. Already on Instagram: recorded as published from the provider, never published twice.
{
  const db = createDb(seed());
  const { d, calls } = deps(db, {
    async listRecentMedia() { return [{ id: "18011111111", caption: "A caption utm_content=post-a", username: "durgsolar", timestamp: "2026-09-17T01:00:00+0000", permalink: "https://www.instagram.com/p/old/" }]; },
  });
  const step = await publishNextCampaignItem(db.service, input, d);
  assert.equal(step.outcome, "already_published");
  assert.equal(step.mediaId, "18011111111");
  assert.equal(calls.runJob.length, 0, "a duplicate publish must never be attempted");
  const job = db.tables.social_publishing_jobs[0];
  assert.equal(job.status, "PUBLISHED");
  assert.equal(job.account_id, "acct-dbs");
  assert.equal(job.result.provider_verification.verified, true);
  console.log("  ok  duplicate guard records the existing post instead of re-publishing");
}

// 9. Happy path: exactly one job, no auto-retry, published, read back and verified against @durgsolar.
{
  const db = createDb(seed());
  const { d, calls } = deps(db);
  const step = await publishNextCampaignItem(db.service, input, d);
  assert.equal(step.outcome, "published");
  assert.equal(step.assetName, "post-a.jpg", "held and format-ineligible items are skipped");
  assert.equal(step.mediaId, "18099999999");
  assert.equal(step.providerVerified, true);
  assert.deepEqual(calls.tokenFor, ["acct-dbs"]);
  assert.equal(calls.runJob.length, 1);
  assert.equal(db.tables.social_publishing_jobs.length, 1, "exactly one post per call");
  const job = db.tables.social_publishing_jobs[0];
  assert.equal(job.max_attempts, 1, "campaign jobs never auto-retry");
  assert.equal(job.account_id, "acct-dbs");
  assert.equal(job.result.provider_verification.account_id, DBS_IG);
  assert.equal(job.result.provider_verification.username, "durgsolar");
  assert.ok(calls.audits.includes("social.campaign.published"));
  console.log("  ok  one post per call, provider read-back verifies @durgsolar");
}

// 10. Read-back from a different account is reported as unverified, not verified.
{
  const db = createDb(seed());
  const { d } = deps(db, { async fetchMedia(_t, id) { return { id, username: "stratxcel.in" }; } });
  const step = await publishNextCampaignItem(db.service, input, d);
  assert.equal(step.outcome, "published");
  assert.equal(step.providerVerified, false);
  console.log("  ok  provider verification fails when the post is not on @durgsolar");
}

// 11. A job under another tenant's account never marks a DBS item as attempted.
{
  const db = createDb(seed({ jobs: [{ id: "job-sx", variant_id: "v-a", account_id: "acct-sx", status: "PUBLISHED", created_at: "2026-09-16T00:00:00Z", result: { mode: "live", external_post_id: "1" } }] }));
  const { d } = deps(db);
  const step = await publishNextCampaignItem(db.service, input, d);
  assert.equal(step.assetName, "post-a.jpg", "foreign-account jobs are ignored for DBS items");
  const dbsJobs = db.tables.social_publishing_jobs.filter((j) => j.account_id === "acct-dbs");
  assert.equal(dbsJobs.length, 1);
  console.log("  ok  cross-tenant jobs never leak into DBS campaign state");
}

// 12. Nothing publishable remains once every cleared item has a job.
{
  const db = createDb(seed({ jobs: [
    { id: "j1", variant_id: "v-a", account_id: "acct-dbs", status: "PUBLISHED", created_at: "2026-09-17T00:00:00Z", result: { mode: "live", external_post_id: "1" } },
    { id: "j2", variant_id: "v-b", account_id: "acct-dbs", status: "FAILED", created_at: "2026-09-17T00:00:01Z", last_error: "x", result: null },
  ] }));
  const { d, calls } = deps(db);
  const step = await publishNextCampaignItem(db.service, input, d);
  assert.equal(step.outcome, "nothing_to_publish");
  assert.equal(calls.runJob.length, 0, "a failed item is not silently retried");
  console.log("  ok  failed items are not auto-retried; nothing_to_publish when done");
}

// 13-14. Provider: quota parsing, and publish() reads the post back without failing a live post.
{
  const { fetchInstagramPublishingLimit, instagramProvider } = await import("../providers/instagram.ts");
  const realFetch = globalThis.fetch;
  const requested: string[] = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  try {
    globalThis.fetch = (async (url: string | URL) => {
      requested.push(String(url));
      return json({ data: [{ quota_usage: 4, config: { quota_total: 100, quota_duration: 86400 } }] });
    }) as typeof fetch;
    assert.deepEqual(await fetchInstagramPublishingLimit("tok", DBS_IG), { quotaUsage: 4, quotaTotal: 100, quotaDurationSeconds: 86400 });
    assert.ok(requested[0].includes(`/${DBS_IG}/content_publishing_limit`));

    globalThis.fetch = (async () => json({ data: [{}] })) as typeof fetch;
    await assert.rejects(() => fetchInstagramPublishingLimit("tok", DBS_IG), /quota fields/);
    console.log("  ok  publishing limit parsed from the provider, malformed response rejected");

    let readBackFails = false;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/media") && init?.method === "POST") return json({ id: "container-1" });
      if (u.includes("/container-1?")) return json({ status_code: "FINISHED" });
      if (u.endsWith("/media_publish")) return json({ id: "18077777777" });
      if (u.includes("/18077777777?")) return readBackFails ? json({ error: { code: 1, message: "temporary" } }, 500) : json({ id: "18077777777", username: "durgsolar", permalink: "https://www.instagram.com/p/z/", timestamp: "2026-09-17T03:00:00+0000" });
      throw new Error("unexpected request " + u);
    }) as typeof fetch;
    const published = await instagramProvider.publish({ accessToken: "tok", externalAccountId: DBS_IG, caption: "c", mediaUrls: ["https://example.test/a.jpg"] });
    assert.equal(published.externalPostId, "18077777777");
    assert.equal(published.permalink, "https://www.instagram.com/p/z/");
    assert.equal((published.raw as { verification: { username: string } }).verification.username, "durgsolar");

    readBackFails = true;
    const unverified = await instagramProvider.publish({ accessToken: "tok", externalAccountId: DBS_IG, caption: "c", mediaUrls: ["https://example.test/a.jpg"] });
    assert.equal(unverified.externalPostId, "18077777777", "a failed read-back must not turn a live post into a failed (retryable) job");
    assert.equal((unverified.raw as { verification: unknown }).verification, null);
    console.log("  ok  publish returns provider read-back; read-back failure never fails a live post");
  } finally {
    globalThis.fetch = realFetch;
  }
}

console.log("\nALL INSTAGRAM CAMPAIGN TESTS PASSED\n");
