/**
 * Single source of truth for the full "extra tools" set composed at the app
 * layer, on top of packages/agent-core's own built-in ADMIN/CLIENT
 * registries. Both real callers of runAgentTurn for staff principals --
 * app/api/internal/agent/whatsapp/route.ts (WhatsApp) and
 * lib/agent-core/copilot-actions.ts (Admin/Client Web Copilot) -- import
 * this ONE array instead of maintaining their own.
 *
 * FOUND AND FIXED as part of the Agent Factory work (2026-09-02): the two
 * call sites had already drifted apart. WhatsApp's own EXTRA_TOOLS included
 * SOCIAL_DELEGATION_TOOLS, which copilot-actions.ts's array never had --
 * Admin Copilot staff could not ask "what social accounts are connected"
 * even though WhatsApp staff could. And copilot-actions.ts's array had
 * just gained AUDIT_REPORT_LINK_TOOL (Update 58) while the WhatsApp route's
 * separate literal was never updated -- get_paid_audit_report_link was
 * reachable from Admin Copilot but silently NOT from WhatsApp, directly
 * contradicting the "wired into both, every time, zero exceptions"
 * discipline this session otherwise followed. A single shared array makes
 * that class of drift structurally impossible going forward: add a tool
 * here once, both channels get it in the same commit.
 */
import type { AgentTool } from "@stratxcel/agent-core";
import { SOCIAL_DELEGATION_TOOLS } from "./social-delegation-tools";
import { RESEARCH_DELEGATION_TOOLS } from "./research-tools";
import { GROWTH_MEDIA_TOOLS } from "./growth-media-tools";
import { WORKFORCE_REGISTRY_TOOLS } from "./workforce-registry-tools";
import { OWNER_CONNECTIONS_TOOL } from "./owner-connections-tool";
import { BUSINESS_SIGNALS_TOOL } from "./business-signals-tool";
import { BUSINESS_PRIORITIES_TOOL } from "./business-priorities-tool";
import { AUTONOMY_DECISION_TOOL } from "./autonomy-decision-tool";
import { REVENUE_DIAGNOSTICS_TOOL } from "./revenue-diagnostics-tool";
import { WEBSITE_TOOLS } from "./website-tools";
import { GOOGLE_BUSINESS_TOOL } from "./google-business-tool";
import { GROWTH_PLAN_TOOL } from "./growth-plan-tool";
import { GROWTH_PLAN_COMMIT_TOOL } from "./growth-plan-commit-tool";
import { AUDIT_REPORT_LINK_TOOL } from "./audit-report-link-tool";
import { CHECK_PLAN_OUTCOMES_TOOL } from "./plan-outcomes-tool";
import { GROWTH_PLAN_REVISION_TOOL } from "./growth-plan-revision-tool";
import { ROLLBACK_DEPLOYMENT_TOOL } from "./rollback-deployment-tool";
import { VALUE_LEDGER_TOOLS } from "./value-ledger-tools";
import { RUN_PROSPECT_AUDIT_ANALYSIS_TOOL } from "./prospect-audit-analysis-tool";

export const ALL_EXTRA_TOOLS: AgentTool[] = [
  ...SOCIAL_DELEGATION_TOOLS,
  ...RESEARCH_DELEGATION_TOOLS,
  ...GROWTH_MEDIA_TOOLS,
  ...WORKFORCE_REGISTRY_TOOLS,
  OWNER_CONNECTIONS_TOOL,
  BUSINESS_SIGNALS_TOOL,
  BUSINESS_PRIORITIES_TOOL,
  AUTONOMY_DECISION_TOOL,
  REVENUE_DIAGNOSTICS_TOOL,
  ...WEBSITE_TOOLS,
  GOOGLE_BUSINESS_TOOL,
  GROWTH_PLAN_TOOL,
  GROWTH_PLAN_COMMIT_TOOL,
  AUDIT_REPORT_LINK_TOOL,
  CHECK_PLAN_OUTCOMES_TOOL,
  GROWTH_PLAN_REVISION_TOOL,
  ROLLBACK_DEPLOYMENT_TOOL,
  ...VALUE_LEDGER_TOOLS,
  RUN_PROSPECT_AUDIT_ANALYSIS_TOOL,
];
