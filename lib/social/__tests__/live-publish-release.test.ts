// Live-publish release safety + Copilot error/selection contracts.
// Run with: node --experimental-strip-types lib/social/__tests__/live-publish-release.test.ts

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toSafeClientError, isMissingClaimRpcError } from "../safe-client-error.ts";
import { classifyCreativeRequestMode } from "../agent/gemini-boundary.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  // 1) Framework / digest text must never reach the owner
  const framework = toSafeClientError(
    new Error("An error occurred in the Server Components render. The specific message is omitted in production builds. Digest: 848476192")
  );
  assert.equal(framework, "Something went wrong while refreshing this review.");
  assert.ok(!/Server Components|digest|848476192/i.test(framework));

  const rpcLeak = toSafeClientError(
    new Error("Could not find the function public.claim_social_agent_action(p_action_id, p_owner_id, p_target_status) in the schema cache")
  );
  assert.ok(!/claim_social_agent_action|schema cache/i.test(rpcLeak));
  assert.ok(isMissingClaimRpcError("Could not find the function public.claim_social_agent_action in the schema cache"));

  const uuidLeak = toSafeClientError(new Error(`Failed for action ${"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"}`));
  assert.ok(!/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/i.test(uuidLeak));

  // 2) Source contracts: claim fallback, safe actions, error boundary, selection persistence
  const agentRepo = read("lib", "social", "repositories", "agent.ts");
  const actions = read("app", "admin", "social", "agent", "actions.ts");
  const session = read("app", "admin", "social", "copilot", "useAgentSession.ts");
  const publishCard = read("app", "admin", "social", "agent", "PublishApprovalCard.tsx");
  const errorBoundary = read("app", "admin", "social", "copilot", "error.tsx");
  const shell = read("app", "admin", "social", "SocialShell.tsx");
  const theme = read("app", "admin", "social", "social-theme.css");
  const orchestrator = read("lib", "social", "agent", "orchestrator.ts");
  const worker = read("lib", "social", "worker.ts");
  const publishing = read("lib", "social", "repositories", "publishing.ts");

  assert.ok(agentRepo.includes("claimAgentActionFallback"), "missing RPC must fall back without throwing digest");
  assert.ok(agentRepo.includes("status = 'PROPOSED'") || agentRepo.includes('.eq("status", "PROPOSED")'));

  assert.ok(actions.includes("toSafeClientError"));
  assert.ok(actions.includes("ok: false as const") || actions.includes("ok: false as const,"), "approve/reject must return safe result objects");
  assert.ok(actions.includes("ok: true as const"), "approve/reject must return ok results");
  assert.ok(!actions.includes('revalidatePath("/admin/social", "layout")'), "layout revalidate remounts and clears selection");
  const editFn = actions.slice(actions.indexOf("export async function editProposedPublishActionAction"));
  assert.ok(!editFn.includes("revalidatePath("), "edit must not remount Copilot");

  assert.ok(errorBoundary.includes("Something went wrong while refreshing this review."));
  assert.ok(errorBoundary.includes("Try again"));
  assert.ok(!/Server Components render/i.test(errorBoundary));
  assert.ok(!errorBoundary.includes("Digest:"));
  assert.ok(!errorBoundary.includes("{error.message}"));
  assert.ok(!errorBoundary.includes("{error.digest}"));

  assert.ok(session.includes("if (!result?.ok)"), "approve must not strip READY artifact before success");
  assert.ok(
    !/const approve = useCallback\(\(actionId: string\) => \{\s*setMessages/.test(session),
    "approve must not optimistically clear actions before the server confirms"
  );

  assert.ok(publishCard.includes("saut:review-selection"), "selection must survive remount via sessionStorage");
  assert.ok(publishCard.includes("data-empty-selection-reason") || publishCard.includes("emptySelectionReason"));
  assert.ok(publishCard.includes("LIVE PUBLISHING"));
  assert.ok(publishCard.includes("Approve selected & publish"));
  assert.ok(publishCard.includes("These posts will be published to real connected accounts."));
  assert.ok(publishCard.includes("saut:live-publish-confirmed"), "live confirm once per session");
  assert.ok(publishCard.includes("data-review-refresh-error") && publishCard.includes("Try again"));

  assert.ok(shell.includes("LIVE PUBLISHING"));

  assert.ok(/minmax\(\s*min\(\s*100%\s*,\s*280px\s*\)\s*,\s*1fr\s*\)/.test(theme), "artifact grid must not force horizontal overflow");
  assert.ok(theme.includes("overflow-x: hidden"));

  // 3) Typed natural language still cannot publish; explicit approval remains mandatory
  assert.equal(classifyCreativeRequestMode("haan", true), "UNSPECIFIED");
  assert.equal(classifyCreativeRequestMode("yes", true), "UNSPECIFIED");
  assert.equal(classifyCreativeRequestMode("kar do", true), "EXECUTE", "preparation intent may prepare drafts only");
  assert.ok(orchestrator.includes("approveAgentAction"), "publish requires approveAgentAction");
  assert.ok(orchestrator.includes("claimAgentAction(ctx, actionId, \"EXECUTING\")"));
  assert.ok(orchestrator.includes("alreadyResolved: true"), "duplicate approve must short-circuit");
  assert.ok(
    publishCard.includes("onApprove") && publishCard.includes("Approve selected & publish"),
    "only the explicit approval dock publishes"
  );
  assert.ok(!session.includes("approveAgentActionAction(text)"), "chat text must not call approve");

  // 4) Idempotent publish + unknown outcome must not blind-retry
  assert.ok(publishing.includes("idempotency_key") && publishing.includes("23505"));
  assert.ok(worker.includes("idempotency_key"));
  assert.ok(
    worker.includes("SHADOW-") || worker.includes("shadow_mode") || worker.includes("shadowMode"),
    "worker must still respect shadow gate"
  );
  const publishOutcome = read("lib", "social", "agent", "publish-outcome-classify.ts");
  assert.ok(publishOutcome.includes("isProvenLivePublish"));
  assert.ok(
    !worker.includes("blindRetry") && !actions.includes("blind retry"),
    "no blind-retry helper for unknown outcomes"
  );

  console.log("live-publish-release.test.ts: ALL PASS");
}

run();
