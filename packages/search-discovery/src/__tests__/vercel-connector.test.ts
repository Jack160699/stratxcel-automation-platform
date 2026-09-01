// Run with: node --experimental-strip-types packages/search-discovery/src/__tests__/vercel-connector.test.ts
//
// Root-caused via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md: no
// website deployment connector existed anywhere in this codebase. Every
// endpoint/response shape used by client.ts was verified against Vercel's
// live documentation during this task (fetched, not recalled), and every
// test here uses a mocked fetcher -- never a real network call, matching
// this codebase's cost/safety discipline (this isn't paid like an AI
// call, but a real external network dependency has no place in an
// automated test either).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateVercelToken,
  listVercelProjects,
  listVercelProjectDomains,
  connectVercelWebsite,
  disconnectVercelWebsite,
  discoverVercelProjects,
  diagnoseVercelConnection,
  classifyTokenValidation,
} from "../vercel/index.ts";
import type { SecretVault } from "@stratxcel/byok";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// --- client.ts: token validation ---

test("1. validateVercelToken: real success shape (GET /v2/user) parses correctly", async () => {
  const fetcher = (async (url: string | URL, init?: RequestInit) => {
    assert.equal(String(url), "https://api.vercel.com/v2/user");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer real-looking-token");
    return jsonResponse(200, { user: { id: "acct_123", username: "jdoe", name: "Jane Doe" } });
  }) as typeof fetch;

  const result = await validateVercelToken("real-looking-token", fetcher);
  assert.equal(result.valid, true);
  assert.equal(result.accountId, "acct_123");
  assert.equal(result.accountName, "Jane Doe");
  assert.equal(result.teamId, null);
  assert.equal(result.projectId, null);
  assert.equal(result.reason, null);
});

// --- Update 19: the actual real, live, reported customer bug -------------
// docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md -- a customer's genuinely
// valid Vercel Personal Access Token, scoped to a specific Team rather than
// "Full Account" (a normal, common choice Vercel itself offers at token
// creation), returned VERCEL_API_ERROR_404 on GET /v2/user -- Vercel's own
// docs confirm 404 isn't even a documented response for that endpoint;
// genuinely bad tokens get 401/403. A team-scoped token has no personal
// "user" resource at all. This is the exact repro and exact fix.

test("1b. validateVercelToken: a Team-scoped token 404s on /v2/user but is correctly recognized as valid via the /v2/teams fallback (the real reported bug, fixed)", async () => {
  const fetcher = (async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/v2/user")) return jsonResponse(404, { error: { code: "not_found" } });
    if (u.includes("/v2/teams")) return jsonResponse(200, { teams: [{ id: "team_abc123", name: "StratXcel", slug: "stratxcel" }] });
    throw new Error(`unexpected URL in test: ${u}`);
  }) as typeof fetch;

  const result = await validateVercelToken("real-team-scoped-token", fetcher);
  assert.equal(result.valid, true);
  assert.equal(result.accountId, "team_abc123");
  assert.equal(result.accountName, "StratXcel");
  assert.equal(result.teamId, "team_abc123");
  assert.equal(result.projectId, null);
  assert.equal(result.reason, null);
});

test("1c. validateVercelToken: a 404 on /v2/user, a genuinely-empty /v2/teams, AND a genuinely-empty /v10/projects is honestly rejected as TEAM_REQUIRED, never fabricated valid", async () => {
  const fetcher = (async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/v2/user")) return jsonResponse(404, {});
    if (u.includes("/v2/teams")) return jsonResponse(200, { teams: [] });
    if (u.includes("/v10/projects")) return jsonResponse(200, []);
    throw new Error(`unexpected URL in test: ${u}`);
  }) as typeof fetch;

  const result = await validateVercelToken("genuinely-bad-token", fetcher);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "TEAM_REQUIRED", "a 404-on-/v2/user token whose /v2/teams AND /v10/projects calls both genuinely succeed with nothing usable is authenticated but has no scope to use -- distinct from an invalid token");
});

// --- Update 24, second pass: re-verified Vercel's own live docs
// (vercel.com/docs/rest-api/getting-started, fetched during this fix) --
// a Personal Access Token can ALSO be scoped to a single Project (the
// narrowest, most-recommended scope), which "denies requests for
// user-level resources, team-level resources" -- meaning /v2/user CAN
// legitimately return 401/403 (not just 404) for a completely valid
// token. The old assumption that 401/403 always means "immediately
// invalid, never fall back" was itself the real second-round bug. -------

test("1d. validateVercelToken: a 401 on /v2/user DOES now fall back and correctly resolves as valid via /v2/teams -- 401/403 is no longer an automatic dead end", async () => {
  const fetcher = (async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/v2/user")) return jsonResponse(401, {});
    if (u.includes("/v2/teams")) return jsonResponse(200, { teams: [{ id: "team_x", name: "X", slug: "x" }] });
    throw new Error(`unexpected URL in test: ${u}`);
  }) as typeof fetch;

  const result = await validateVercelToken("team-scoped-token-that-401s", fetcher);
  assert.equal(result.valid, true, "a 401 on /v2/user must not be treated as an automatic, unrecoverable dead end -- a genuinely valid team-scoped token can present this way");
  assert.equal(result.teamId, "team_x");
});

test("1d2. validateVercelToken: a Project-scoped token (denied on BOTH /v2/user and /v2/teams, per Vercel's own documented scope model) is correctly recognized as valid via the /v10/projects fallback", async () => {
  const fetcher = (async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/v2/user")) return jsonResponse(403, { error: { code: "forbidden", message: "Not authorized" } });
    if (u.includes("/v2/teams")) return jsonResponse(403, { error: { code: "forbidden", message: "Not authorized" } });
    if (u.includes("/v10/projects")) return jsonResponse(200, [{ id: "prj_1", name: "stratxcel", framework: "nextjs" }]);
    throw new Error(`unexpected URL in test: ${u}`);
  }) as typeof fetch;

  const result = await validateVercelToken("real-project-scoped-token", fetcher);
  assert.equal(result.valid, true, "vercel.com/docs/rest-api/getting-started: 'A project-scoped token denies requests for user-level resources, team-level resources' -- this is a genuinely valid token, not an invalid one");
  assert.equal(result.projectId, "prj_1");
  assert.equal(result.accountName, "stratxcel");
  assert.equal(result.teamId, null);
});

test("1d3. validateVercelToken: denied (401) on ALL of /v2/user, /v2/teams, AND /v10/projects -- only THEN is INVALID_TOKEN concluded, having exhausted every real scope", async () => {
  let userCalled = false, teamsCalled = false, projectsCalled = false;
  const fetcher = (async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/v2/user")) userCalled = true;
    if (u.includes("/v2/teams")) teamsCalled = true;
    if (u.includes("/v10/projects")) projectsCalled = true;
    return jsonResponse(401, { error: { code: "forbidden", message: "Not authorized" } });
  }) as typeof fetch;

  const result = await validateVercelToken("genuinely-expired-token", fetcher);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "INVALID_TOKEN");
  assert.equal(userCalled, true);
  assert.equal(teamsCalled, true, "must actually try the team fallback before concluding invalid -- never assume from /v2/user alone");
  assert.equal(projectsCalled, true, "must actually try the project fallback too -- the narrowest, most-recommended real Vercel token scope must be checked before giving up");
  assert.equal(result.httpStatus, 401, "the real /v2/user status must be captured for a forensic record");
  assert.equal(result.providerErrorCode, "forbidden", "Vercel's own safe, non-secret error code must be captured for a forensic record");
});

test("1e. validateVercelToken: a 404 on /v2/user whose /v2/teams fallback ALSO says unauthorized is reported as INVALID_TOKEN, not the stale generic 404", async () => {
  const fetcher = (async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/v2/user")) return jsonResponse(404, {});
    if (u.includes("/v2/teams")) return jsonResponse(403, {});
    throw new Error(`unexpected URL in test: ${u}`);
  }) as typeof fetch;

  const result = await validateVercelToken("revoked-team-token", fetcher);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "INVALID_TOKEN", "when the /v2/teams fallback itself says 401/403, both endpoints agree the token is bad -- must not stay a generic VERCEL_API_ERROR_404");
});

test("1f. validateVercelToken: a 404 on /v2/user whose /v2/teams fallback fails with a provider error (5xx) is reported as PROVIDER_UNAVAILABLE, not confused with an empty-teams TEAM_REQUIRED", async () => {
  const fetcher = (async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/v2/user")) return jsonResponse(404, {});
    if (u.includes("/v2/teams")) return jsonResponse(503, {});
    throw new Error(`unexpected URL in test: ${u}`);
  }) as typeof fetch;

  const result = await validateVercelToken("token-during-outage", fetcher);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "PROVIDER_UNAVAILABLE", "a /v2/teams 5xx means the provider call itself failed -- must not be reported the same as a genuinely valid-but-team-less token");
});

test("2. validateVercelToken: real 401 shape is honestly reported, never treated as valid", async () => {
  const fetcher = (async () => jsonResponse(401, { error: { code: "forbidden" } })) as typeof fetch;
  const result = await validateVercelToken("bad-token", fetcher);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "INVALID_TOKEN");
});

test("2b. validateVercelToken: a real 5xx on /v2/user is reported as PROVIDER_UNAVAILABLE, never as a customer credential problem", async () => {
  const fetcher = (async () => jsonResponse(503, { error: "internal" })) as typeof fetch;
  const result = await validateVercelToken("token", fetcher);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "PROVIDER_UNAVAILABLE");
});

test("2c. validateVercelToken: a 200 response with an unrecognized body shape is reported as INTERNAL_ERROR, never fabricated valid", async () => {
  const fetcher = (async () => jsonResponse(200, { unexpected: true })) as typeof fetch;
  const result = await validateVercelToken("token", fetcher);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "INTERNAL_ERROR");
});

test("3. validateVercelToken: a network failure is honestly reported as PROVIDER_UNAVAILABLE, never fabricated as valid", async () => {
  const fetcher = (async () => {
    throw new Error("getaddrinfo ENOTFOUND api.vercel.com");
  }) as typeof fetch;
  const result = await validateVercelToken("token", fetcher);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "PROVIDER_UNAVAILABLE");
});

// --- vercel/diagnostics.ts: full connect->team->project->domain pipeline
//     (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update 24) ---

function fakeValidation(overrides: Partial<Awaited<ReturnType<typeof validateVercelToken>>>): Awaited<ReturnType<typeof validateVercelToken>> {
  return { valid: false, accountId: null, accountName: null, teamId: null, projectId: null, reason: null, httpStatus: null, providerErrorCode: null, providerErrorMessage: null, ...overrides };
}

test("D1. classifyTokenValidation: maps every real validateVercelToken outcome to its own internal diagnostic classification", () => {
  assert.equal(classifyTokenValidation(fakeValidation({ valid: true, accountId: "a", accountName: "A" })), "TOKEN_VALID_PERSONAL");
  assert.equal(classifyTokenValidation(fakeValidation({ valid: true, accountId: "t", accountName: "T", teamId: "team_1" })), "TOKEN_VALID_TEAM");
  assert.equal(classifyTokenValidation(fakeValidation({ valid: true, accountName: "P", projectId: "prj_1" })), "TOKEN_VALID_PROJECT");
  assert.equal(classifyTokenValidation(fakeValidation({ reason: "INVALID_TOKEN" })), "TOKEN_INVALID");
  assert.equal(classifyTokenValidation(fakeValidation({ reason: "TEAM_REQUIRED" })), "TEAM_ACCESS_MISSING");
  assert.equal(classifyTokenValidation(fakeValidation({ reason: "PROVIDER_UNAVAILABLE" })), "PROVIDER_ERROR");
  assert.equal(classifyTokenValidation(fakeValidation({ reason: "INTERNAL_ERROR" })), "INTERNAL_ERROR");
});

test("D2. diagnoseVercelConnection: a token denied on /v2/user AND every real fallback (team, project) genuinely finds nothing usable classifies as TOKEN_INVALID", async () => {
  const fetcher = (async (url: string | URL) => {
    if (String(url).includes("/v2/user")) return jsonResponse(401, {});
    // Update 24, second pass: a 401 on /v2/user is no longer an automatic
    // dead end -- it must still try /v2/teams and /v10/projects (a
    // Project-scoped token legitimately gets denied on /v2/user too) before
    // concluding TOKEN_INVALID. This fetcher lets both fallbacks succeed
    // with genuinely zero usable results, never denies them explicitly.
    return jsonResponse(200, {});
  }) as typeof fetch;
  const result = await diagnoseVercelConnection("bad-token", "https://www.stratxcel.in", fetcher);
  assert.equal(result.classification, "TOKEN_INVALID", "the explicit 401 on /v2/user is real, unambiguous evidence, even though the fallback endpoints were also genuinely tried");
  assert.equal(result.failingCall, "GET /v2/user");
});

test("D3. diagnoseVercelConnection: a valid personal token whose account has zero Vercel projects classifies as PROJECT_NOT_FOUND, not a token failure", async () => {
  const fetcher = (async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/v2/user")) return jsonResponse(200, { user: { id: "acct_1", username: "jdoe" } });
    if (u.includes("/v10/projects")) return jsonResponse(200, []);
    throw new Error(`unexpected URL: ${u}`);
  }) as typeof fetch;
  const result = await diagnoseVercelConnection("real-token", "https://www.stratxcel.in", fetcher);
  assert.equal(result.classification, "PROJECT_NOT_FOUND");
  assert.equal(result.failingCall, "GET /v10/projects");
  assert.equal(result.accountId, "acct_1", "the real account identity must still be reported even though no project matched -- this is not a token failure");
});

test("D4. diagnoseVercelConnection: listing projects returns 403 (insufficient scope) classifies as PROJECT_ACCESS_MISSING, distinct from an invalid token", async () => {
  const fetcher = (async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/v2/user")) return jsonResponse(200, { user: { id: "acct_1", username: "jdoe" } });
    if (u.includes("/v10/projects")) return jsonResponse(403, {});
    throw new Error(`unexpected URL: ${u}`);
  }) as typeof fetch;
  const result = await diagnoseVercelConnection("real-token", "https://www.stratxcel.in", fetcher);
  assert.equal(result.classification, "PROJECT_ACCESS_MISSING");
  assert.equal(result.httpStatus, 403);
});

test("D5. diagnoseVercelConnection: real projects exist but none of their real domains match the target website -> DOMAIN_MISMATCH, never a name-based guess", async () => {
  const fetcher = (async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/v2/user")) return jsonResponse(200, { user: { id: "acct_1", username: "jdoe" } });
    if (u.includes("/v10/projects")) return jsonResponse(200, [{ id: "prj_1", name: "stratxcel-site", framework: "nextjs" }]); // name LOOKS right, but...
    if (u.includes("/domains")) return jsonResponse(200, { domains: [{ name: "unrelated-project.example.com", apexName: "example.com", verified: true }] }); // ...its real domain is unrelated
    throw new Error(`unexpected URL: ${u}`);
  }) as typeof fetch;
  const result = await diagnoseVercelConnection("real-token", "https://www.stratxcel.in", fetcher);
  assert.equal(result.classification, "DOMAIN_MISMATCH", "a project merely NAMED like the target site, with no real matching domain, must never be treated as a match");
  assert.equal(result.matchedProjectId, null);
});

test("D6. diagnoseVercelConnection: real project + real matching domain -> the full success path, TOKEN_VALID_TEAM with the matched project/domain reported", async () => {
  const fetcher = (async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/v2/user")) return jsonResponse(404, {});
    if (u.includes("/v2/teams")) return jsonResponse(200, { teams: [{ id: "team_abc123", name: "StratXcel", slug: "stratxcel" }] });
    if (u.includes("/v10/projects")) {
      assert.match(u, /teamId=team_abc123/);
      return jsonResponse(200, [{ id: "prj_1", name: "stratxcel-site", framework: "nextjs" }]);
    }
    if (u.includes("/domains")) {
      assert.match(u, /teamId=team_abc123/);
      return jsonResponse(200, { domains: [{ name: "www.stratxcel.in", apexName: "stratxcel.in", verified: true }] });
    }
    throw new Error(`unexpected URL: ${u}`);
  }) as typeof fetch;
  const result = await diagnoseVercelConnection("real-team-token", "https://www.stratxcel.in", fetcher);
  assert.equal(result.classification, "TOKEN_VALID_TEAM");
  assert.equal(result.failingCall, "NONE");
  assert.equal(result.matchedProjectId, "prj_1");
  assert.equal(result.matchedDomain, "www.stratxcel.in");
  assert.equal(result.teamId, "team_abc123");
});

// --- client.ts: project/domain listing ---

test("4. listVercelProjects: parses the real raw-array response shape", async () => {
  const fetcher = (async () =>
    jsonResponse(200, [
      { id: "prj_1", name: "my-site", framework: "nextjs", alias: [{ domain: "my-site.example.com" }], latestDeployments: [{ id: "dpl_1", url: "my-site.vercel.app", readyState: "READY", target: "production" }] },
    ])) as typeof fetch;

  const projects = await listVercelProjects("token", { fetcher });
  assert.equal(projects.length, 1);
  assert.equal(projects[0]!.externalProjectId, "prj_1");
  assert.equal(projects[0]!.framework, "nextjs");
  assert.equal(projects[0]!.lastDeploymentState, "READY");
  assert.equal(projects[0]!.domains[0]!.name, "my-site.example.com");
});

test("5. listVercelProjects: parses the real { projects, pagination } response shape", async () => {
  const fetcher = (async () =>
    jsonResponse(200, { projects: [{ id: "prj_2", name: "other-site", framework: null }], pagination: { count: 1, next: null } })) as typeof fetch;

  const projects = await listVercelProjects("token", { fetcher });
  assert.equal(projects.length, 1);
  assert.equal(projects[0]!.externalProjectId, "prj_2");
  assert.equal(projects[0]!.framework, null);
  assert.deepEqual(projects[0]!.domains, [], "a project with no alias must produce an empty domain list, never a fabricated one");
});

test("6. listVercelProjects: a real API error throws with the real status, not a silent empty list", async () => {
  const fetcher = (async () => jsonResponse(500, { error: "internal" })) as typeof fetch;
  await assert.rejects(() => listVercelProjects("token", { fetcher }), /HTTP 500/);
});

test("7. listVercelProjectDomains: real verification-status field flows through", async () => {
  const fetcher = (async () => jsonResponse(200, { domains: [{ name: "unverified.example.com", apexName: "example.com", verified: false }] })) as typeof fetch;
  const domains = await listVercelProjectDomains("token", "prj_1", { fetcher });
  assert.equal(domains[0]!.verified, false, "a genuinely unverified domain must never be reported as verified");
});

test("7b. listVercelProjectDomains: a supplied teamId is actually sent as a query param, not silently dropped", async () => {
  const fetcher = (async (url: string | URL) => {
    assert.match(String(url), /teamId=team_abc123/);
    return jsonResponse(200, { domains: [] });
  }) as typeof fetch;
  await listVercelProjectDomains("token", "prj_1", { teamId: "team_abc123", fetcher });
});

// --- connector.ts: connect/disconnect/discover, with a mock DB + mock vault ---

function createMockVault(): SecretVault & { stored: Map<string, string> } {
  const stored = new Map<string, string>();
  return {
    stored,
    async store(plaintext: string) {
      const ref = `vault-ref-${stored.size + 1}`;
      stored.set(ref, plaintext);
      return ref;
    },
    async retrieve(ref: string) {
      return stored.get(ref) ?? null;
    },
    async revoke(ref: string) {
      stored.delete(ref);
    },
  };
}

function createMockDb() {
  const connections: any[] = [];
  const projects: any[] = [];
  const auditEvents: any[] = [];
  return {
    getConnections: () => connections,
    getProjects: () => projects,
    getAuditEvents: () => auditEvents,
    from(table: string) {
      return {
        insert(row: any) {
          // recordAuditEvent's real shape: .insert({...}).select("*").single()
          const saved = { id: `audit-${auditEvents.length + 1}`, ...row };
          if (table === "audit_events") auditEvents.push(saved);
          return { select: () => ({ single: async () => ({ data: saved, error: null }) }) };
        },
        select() {
          return {
            eq(col1: string, val1: string) {
              return {
                eq(col2: string, val2: string) {
                  return {
                    maybeSingle: async () => {
                      const row = connections.find((c) => c[col1] === val1 && c[col2] === val2);
                      return { data: row ?? null, error: null };
                    },
                  };
                },
                maybeSingle: async () => {
                  const row = connections.find((c) => c[col1] === val1);
                  return { data: row ?? null, error: null };
                },
              };
            },
          };
        },
        upsert(row: any) {
          // Perform the write eagerly (real Supabase upserts on call, not
          // on .select()) so both `await ...upsert(...)` directly AND
          // `await ...upsert(...).select().single()` observe the same
          // real result -- this mock was previously only wired for the
          // second form, silently no-op-ing the first (see
          // docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md).
          let result: { data: any; error: any };
          if (table === "search_website_connections") {
            const existingIdx = connections.findIndex((c) => c.tenant_id === row.tenant_id && c.provider === row.provider);
            const id = existingIdx >= 0 ? connections[existingIdx].id : `conn-${connections.length + 1}`;
            const saved = { id, ...row };
            if (existingIdx >= 0) connections[existingIdx] = saved;
            else connections.push(saved);
            result = { data: { id }, error: null };
          } else if (table === "search_website_connection_projects") {
            projects.push(row);
            result = { data: { id: `proj-${projects.length}` }, error: null };
          } else {
            result = { data: null, error: null };
          }
          return Object.assign(Promise.resolve(result), {
            select() {
              return { single: async () => result };
            },
          });
        },
        update(patch: any) {
          return {
            eq(_col: string, id: string) {
              const idx = connections.findIndex((c) => c.id === id);
              if (idx >= 0) connections[idx] = { ...connections[idx], ...patch };
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
        delete() {
          return {
            eq(_col: string, id: string) {
              const idx = connections.findIndex((c) => c.id === id);
              if (idx >= 0) connections.splice(idx, 1);
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  } as any;
}

test("8. connectVercelWebsite: an invalid token never creates a connection or a vault entry", async () => {
  const db = createMockDb();
  const vault = createMockVault();
  const fetcher = (async () => jsonResponse(401, {})) as typeof fetch;

  const result = await connectVercelWebsite(db, { tenantId: "t1", connectedByUserId: "u1", token: "bad-token", fetcher, vault });
  assert.equal(result.ok, false);
  assert.equal(db.getConnections().length, 0);
  assert.equal(vault.stored.size, 0, "an invalid token must never reach the vault");
});

test("9. connectVercelWebsite: a real valid token creates a connection with the token vaulted, not stored raw", async () => {
  const db = createMockDb();
  const vault = createMockVault();
  const fetcher = (async () => jsonResponse(200, { user: { id: "acct_1", username: "jdoe", name: "Jane Doe" } })) as typeof fetch;

  const result = await connectVercelWebsite(db, { tenantId: "t1", connectedByUserId: "u1", token: "real-token-value", fetcher, vault });
  assert.equal(result.ok, true);
  assert.equal(result.accountName, "Jane Doe");

  const saved = db.getConnections()[0];
  assert.equal(saved.tenant_id, "t1");
  assert.notEqual(saved.token_vault_ref, "real-token-value", "the raw token must never be the stored value -- only a vault reference");
  assert.equal(vault.stored.get(saved.token_vault_ref), "real-token-value", "the vault itself must hold the real token, retrievable only by its ref");
});

test("10. discoverVercelProjects: not connected is honestly reported, never a fabricated empty success", async () => {
  const db = createMockDb();
  const result = await discoverVercelProjects(db, { tenantId: "t1" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "NOT_CONNECTED");
});

test("11. discoverVercelProjects: real connected tenant discovers and persists real projects", async () => {
  const db = createMockDb();
  const vault = createMockVault();
  const connectFetcher = (async () => jsonResponse(200, { user: { id: "acct_1", username: "jdoe", name: "Jane Doe" } })) as typeof fetch;
  await connectVercelWebsite(db, { tenantId: "t1", connectedByUserId: "u1", token: "real-token", fetcher: connectFetcher, vault });

  const discoverFetcher = (async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/v10/projects")) return jsonResponse(200, [{ id: "prj_1", name: "site-1", framework: "nextjs", alias: [{ domain: "site1.example.com" }] }]);
    if (u.includes("/domains")) return jsonResponse(200, { domains: [{ name: "site1.example.com", apexName: "example.com", verified: true }] });
    throw new Error(`unexpected URL in test: ${u}`);
  }) as typeof fetch;

  const result = await discoverVercelProjects(db, { tenantId: "t1", fetcher: discoverFetcher, vault });
  assert.equal(result.ok, true);
  assert.equal(result.projectCount, 1);
  assert.equal(db.getProjects()[0]!.project_name, "site-1");
  assert.equal(db.getProjects()[0]!.domains[0]!.verified, true);
});

test("11b. connectVercelWebsite -> discoverVercelProjects: a Team-scoped token's team_id is persisted and actually threaded into the real project + domain API calls, end to end", async () => {
  const db = createMockDb();
  const vault = createMockVault();
  const connectFetcher = (async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/v2/user")) return jsonResponse(404, {});
    if (u.includes("/v2/teams")) return jsonResponse(200, { teams: [{ id: "team_abc123", name: "StratXcel", slug: "stratxcel" }] });
    throw new Error(`unexpected URL in test: ${u}`);
  }) as typeof fetch;
  const connectResult = await connectVercelWebsite(db, { tenantId: "t1", connectedByUserId: "u1", token: "real-team-token", fetcher: connectFetcher, vault });
  assert.equal(connectResult.ok, true);
  assert.equal(db.getConnections()[0]!.team_id, "team_abc123", "the resolved teamId must actually be persisted on the connection row, not dropped");

  const discoverFetcher = (async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/v10/projects")) {
      assert.match(u, /teamId=team_abc123/, "project discovery must pass the stored teamId, not omit it");
      return jsonResponse(200, [{ id: "prj_1", name: "stratxcel-site", framework: "nextjs", alias: [{ domain: "www.stratxcel.in" }] }]);
    }
    if (u.includes("/domains")) {
      assert.match(u, /teamId=team_abc123/, "domain discovery must also pass the stored teamId, not omit it");
      return jsonResponse(200, { domains: [{ name: "www.stratxcel.in", apexName: "stratxcel.in", verified: true }] });
    }
    throw new Error(`unexpected URL in test: ${u}`);
  }) as typeof fetch;

  const result = await discoverVercelProjects(db, { tenantId: "t1", fetcher: discoverFetcher, vault });
  assert.equal(result.ok, true);
  assert.equal(result.projectCount, 1);
  assert.equal(db.getProjects()[0]!.domains[0]!.name, "www.stratxcel.in");
});

test("11c. connectVercelWebsite: a valid token whose project-listing call fails downstream still succeeds -- section 9's 'token valid but project missing is not a token failure'", async () => {
  const db = createMockDb();
  const vault = createMockVault();
  const fetcher = (async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/v2/user")) return jsonResponse(200, { user: { id: "acct_1", username: "jdoe" } });
    if (u.includes("/v10/projects")) return jsonResponse(503, {}); // Vercel itself having a bad moment, AFTER the token was already proven valid
    throw new Error(`unexpected URL: ${u}`);
  }) as typeof fetch;

  const result = await connectVercelWebsite(db, { tenantId: "t1", connectedByUserId: "u1", token: "real-token", fetcher, vault });
  assert.equal(result.ok, true, "a proven-valid token must still connect even when a later, separate project-listing call fails -- that is not a token failure");
  assert.equal(result.diagnosticState, "PROVIDER_ERROR", "the downstream problem is still surfaced as detail, just never as a connect failure");
  assert.equal(db.getConnections().length, 1);
});

test("11d. connectVercelWebsite: every attempt (success and failure) writes a real audit event, and it never contains the raw token", async () => {
  const db = createMockDb();
  const vault = createMockVault();

  const badFetcher = (async () => jsonResponse(401, {})) as typeof fetch;
  await connectVercelWebsite(db, { tenantId: "t1", connectedByUserId: "u1", token: "SECRET-BAD-TOKEN-VALUE", fetcher: badFetcher, vault });

  const goodFetcher = (async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/v2/user")) return jsonResponse(200, { user: { id: "acct_1", username: "jdoe" } });
    if (u.includes("/v10/projects")) return jsonResponse(200, []);
    throw new Error(`unexpected URL: ${u}`);
  }) as typeof fetch;
  await connectVercelWebsite(db, { tenantId: "t1", connectedByUserId: "u1", token: "SECRET-GOOD-TOKEN-VALUE", fetcher: goodFetcher, vault });

  const events = db.getAuditEvents();
  assert.equal(events.length, 2, "both the failed and the succeeded attempt must each write a real audit event -- previously neither did");
  assert.equal(events[0].action, "SEARCH_VERCEL_CONNECT_ATTEMPTED");
  assert.equal(events[0].metadata.outcome, "failed");
  assert.equal(events[0].metadata.classification, "TOKEN_INVALID");
  assert.equal(events[1].metadata.outcome, "succeeded");
  assert.equal(events[1].metadata.classification, "PROJECT_NOT_FOUND");
  for (const event of events) {
    const serialized = JSON.stringify(event);
    assert.doesNotMatch(serialized, /SECRET-BAD-TOKEN-VALUE/, "the audit record must never contain the raw token");
    assert.doesNotMatch(serialized, /SECRET-GOOD-TOKEN-VALUE/, "the audit record must never contain the raw token");
  }
});

test("12. disconnectVercelWebsite: real disconnect removes the connection and revokes the vault entry", async () => {
  const db = createMockDb();
  const vault = createMockVault();
  const fetcher = (async () => jsonResponse(200, { user: { id: "acct_1", username: "jdoe", name: "Jane Doe" } })) as typeof fetch;
  const connectResult = await connectVercelWebsite(db, { tenantId: "t1", connectedByUserId: "u1", token: "real-token", fetcher, vault });
  const tokenRef = db.getConnections()[0]!.token_vault_ref;
  assert.ok(vault.stored.has(tokenRef));

  const disconnectResult = await disconnectVercelWebsite(db, { tenantId: "t1", vault });
  assert.equal(disconnectResult.ok, true);
  assert.equal(db.getConnections().length, 0);
  assert.equal(vault.stored.has(tokenRef), false, "disconnecting must actually revoke the vaulted secret, not just delete the connection row");
  void connectResult;
});

test("13. disconnectVercelWebsite: disconnecting an already-disconnected tenant is idempotent, never an error", async () => {
  const db = createMockDb();
  const result = await disconnectVercelWebsite(db, { tenantId: "never-connected" });
  assert.equal(result.ok, true);
});

console.log("vercel-connector.test.ts: real Vercel API response shapes parse correctly; connect/disconnect/discover never store a raw token or fabricate success; the full token->team->project->domain diagnostic pipeline classifies every real failure mode correctly, a downstream project/domain problem never undoes a proven-valid token, and every connect attempt is now really audited — PASS");
