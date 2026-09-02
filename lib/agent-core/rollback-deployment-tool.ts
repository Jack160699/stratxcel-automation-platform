/**
 * rollback_deployment: the real mutation half of engine:website_vercel_orchestration
 * that check_deployment_status (Update 54, read-only) explicitly left open.
 * Points production traffic at a REAL, already-built, already-verified
 * prior deployment -- packages/search-discovery/src/vercel/client.ts's
 * promoteVercelDeployment, verified against Vercel's real, documented
 * endpoint (POST /v10/projects/{projectId}/promote/{deploymentId} -- "does
 * NOT rebuild the deployment").
 *
 * A real safety check, not just a comment promising one: this tool refuses
 * to promote any deploymentId that isn't found, with readyState === "READY",
 * in the platform's own real recent deployment history
 * (listVercelDeployments -- the same real function check_deployment_status
 * already uses) -- never trusts an arbitrary model- or user-supplied id.
 *
 * Verification note, stated honestly: unlike every other real external call
 * verified this session, this one was NOT exercised against the live
 * Vercel API even once. A DB write can be wrapped in a transaction and
 * rolled back; a real Vercel promote call cannot be "tested" that way --
 * calling it for real IS the production change. Verified instead the way
 * packages/search-discovery/src/__tests__/vercel-connector.test.ts already
 * verifies every other Vercel client function: a mocked fetcher asserting
 * the exact real request shape (see
 * vercel-promote-deployment.test.ts). risk: external_mutation,
 * confirm-gated on every channel -- the same classification as
 * commit_growth_plan and revise_growth_plan.
 */
import type { AgentTool } from "@stratxcel/agent-core";
import { listVercelDeployments, promoteVercelDeployment } from "@stratxcel/search-discovery";

export const ROLLBACK_DEPLOYMENT_TOOL: AgentTool = {
  schema: {
    name: "rollback_deployment",
    description:
      "Rolls back the platform's own live website by promoting a REAL, already-built prior deployment back to production (points production traffic at it; does not rebuild anything). Requires a real deploymentId from a recent check_deployment_status call -- refuses to promote any id not found in the platform's own recent, READY deployment history. Use only after a human has confirmed which prior deployment to roll back to, never speculatively.",
    parameters: {
      type: "object",
      properties: {
        deploymentId: { type: "string", description: "A real deployment id from a prior check_deployment_status call (the 'id' field, e.g. 'dpl_...'). Never invent one." },
      },
      required: ["deploymentId"],
    },
  },
  mutating: true,
  risk: "external_mutation",
  requiredPermission: "agent:mutate:website",
  async execute(_ctx, args) {
    const deploymentId = typeof args.deploymentId === "string" ? args.deploymentId.trim() : "";
    if (!deploymentId) return { outcome: "FAILED", reason: "missing_deployment_id" };

    const token = process.env.VERCEL_AUTH_TOKEN;
    if (!token) return { outcome: "FAILED", reason: "VERCEL_AUTH_TOKEN is not configured" };
    const projectId = process.env.VERCEL_PROJECT_ID || "prj_81j5A5rArsPVVNspwSPGGfuhg9NZ";

    let recentDeployments;
    try {
      recentDeployments = await listVercelDeployments(token, { projectId, limit: 20 });
    } catch (err) {
      return { outcome: "FAILED", reason: err instanceof Error ? err.message : "deployment_lookup_failed" };
    }

    const target = recentDeployments.find((d) => d.id === deploymentId);
    if (!target) {
      return { outcome: "FAILED", reason: "deployment_not_in_recent_history", detail: "This deployment id is not in the platform's recent deployment history -- call check_deployment_status first to get a real id." };
    }
    if (target.readyState !== "READY") {
      return { outcome: "FAILED", reason: "deployment_not_ready", detail: `That deployment's real status is ${target.readyState}, not READY -- refusing to promote a build that isn't confirmed healthy.` };
    }

    try {
      await promoteVercelDeployment(token, { projectId, deploymentId });
      return { outcome: "PROMOTED", deploymentId, url: target.url };
    } catch (err) {
      return { outcome: "FAILED", reason: err instanceof Error ? err.message : "promote_failed" };
    }
  },
  interpretOutcome(result) {
    const r = result as { outcome?: string; reason?: string } | null;
    if (r?.outcome === "PROMOTED") return null;
    return { status: "failed", detail: r?.reason };
  },
};
