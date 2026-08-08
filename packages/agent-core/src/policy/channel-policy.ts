import type { AgentChannel } from "../principal.ts";
import type { ToolRisk } from "../tools/contract.ts";

/**
 * Channel mutation policy — independent of the model. The model/provider can
 * request a tool call, but this function (not the model) decides whether it
 * executes immediately, requires an explicit confirmation round-trip, or is
 * dashboard-only. See PHASE 14 in the build brief.
 */
export type MutationDecision =
  | { action: "execute" }
  | { action: "confirm_required" }
  | { action: "dashboard_only" };

export function decideMutationPolicy(channel: AgentChannel, risk: ToolRisk): MutationDecision {
  // high_risk is never executable from any agent channel in v1, full stop —
  // see the HIGH-RISK POLICY denylist in the build brief. No tool in this
  // package's registries is currently classified high_risk; this is a
  // structural backstop in case one ever is added.
  if (risk === "high_risk") return { action: "dashboard_only" };

  if (channel === "whatsapp") {
    if (risk === "read") return { action: "execute" };
    if (risk === "low_mutation") return { action: "confirm_required" };
    // external_mutation over WhatsApp v1: dashboard approval only, per spec.
    return { action: "dashboard_only" };
  }

  // ADMIN_WEB / CLIENT_WEB: existing tenant RBAC/approval machinery
  // (lib/rbac/policy.ts, packages/approvals) is the authority for whether a
  // given role may invoke a given mutation at all — that permission check
  // already happened in resolveTools()/resolveAdminTools()/resolveClientTools()
  // before a tool ever reaches here. This phase does not build the admin/client
  // web UI, so wiring a *specific* mutation into the existing approval queue
  // (packages/approvals.requestApproval) is left to that UI's implementation;
  // this function's job is only to say the mutation may proceed once
  // permission-gated, which is what "execute" means here.
  return { action: "execute" };
}
