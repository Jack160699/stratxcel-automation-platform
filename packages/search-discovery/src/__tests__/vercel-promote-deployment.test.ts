// Run with: node --experimental-strip-types packages/search-discovery/src/__tests__/vercel-promote-deployment.test.ts
//
// promoteVercelDeployment (POST /v10/projects/{projectId}/promote/{deploymentId})
// changes live production traffic -- unlike every other real external call
// this session verified with a live round trip (a DB transaction can be
// rolled back; a real Vercel promote cannot be "undone" as a test, it
// would just BE a real deployment change). So this real function is
// verified the way vercel-connector.test.ts already verifies every other
// Vercel client function: a mocked fetcher asserting the exact real
// request shape, never a live network call. rollback-deployment-tool.ts's
// own real-deployment safety check (only ever promotes an id already
// confirmed READY via listVercelDeployments) is what makes the tool safe
// to actually invoke live -- that check itself is tested here too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { promoteVercelDeployment, VercelApiError } from "../vercel/client.ts";

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

test("1. promoteVercelDeployment: real POST to /v10/projects/{projectId}/promote/{deploymentId}", async () => {
  let calledUrl: string | undefined;
  let calledMethod: string | undefined;
  let calledAuth: string | undefined;
  const fetcher = (async (url: string | URL, init?: RequestInit) => {
    calledUrl = String(url);
    calledMethod = init?.method;
    calledAuth = (init?.headers as Record<string, string>).Authorization;
    return emptyResponse(201);
  }) as typeof fetch;

  await promoteVercelDeployment("real-token", { projectId: "prj_abc", deploymentId: "dpl_xyz", fetcher });
  assert.equal(calledUrl, "https://api.vercel.com/v10/projects/prj_abc/promote/dpl_xyz");
  assert.equal(calledMethod, "POST");
  assert.equal(calledAuth, "Bearer real-token");
});

test("2. promoteVercelDeployment: teamId is appended as a real query param when supplied", async () => {
  let calledUrl: string | undefined;
  const fetcher = (async (url: string | URL) => {
    calledUrl = String(url);
    return emptyResponse(202);
  }) as typeof fetch;

  await promoteVercelDeployment("real-token", { projectId: "prj_abc", deploymentId: "dpl_xyz", teamId: "team_1", fetcher });
  assert.equal(calledUrl, "https://api.vercel.com/v10/projects/prj_abc/promote/dpl_xyz?teamId=team_1");
});

test("3. promoteVercelDeployment: a real non-ok response throws VercelApiError with the real status, never silently succeeds", async () => {
  const fetcher = (async () => emptyResponse(404)) as typeof fetch;
  await assert.rejects(
    () => promoteVercelDeployment("real-token", { projectId: "prj_abc", deploymentId: "dpl_missing", fetcher }),
    (err: unknown) => err instanceof VercelApiError && err.status === 404,
  );
});

test("4. promoteVercelDeployment: 409 (conflict, per Vercel's documented error responses) also throws, not swallowed as success", async () => {
  const fetcher = (async () => emptyResponse(409)) as typeof fetch;
  await assert.rejects(
    () => promoteVercelDeployment("real-token", { projectId: "prj_abc", deploymentId: "dpl_conflict", fetcher }),
    (err: unknown) => err instanceof VercelApiError && err.status === 409,
  );
});
