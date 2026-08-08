/**
 * Social Autopilot capability delegation for the agent core (PHASE 8
 * "SOCIAL CAPABILITIES"). Lives in the Next.js app (not packages/agent-core)
 * because it must import lib/social/repositories directly — packages/*
 * cannot depend on app-side code. This is a thin adapter, not a
 * reimplementation: every tool below calls an EXISTING repository function
 * unmodified.
 *
 * IMPORTANT FINDING FROM AUDIT: not every social read function is reachable
 * this way. listAccountsService()/listJobsService() accept a plain
 * ServiceClient and work fine here. listDeadLetters() and
 * listRecentMetrics(), however, take an OwnerContext — which is bound to a
 * cookie-scoped, RLS-enabled Supabase client from requireOwnerContext()
 * (see lib/social/db-context.ts), not a service-role client. There is no
 * browser session/cookie in a HMAC-authenticated server-to-server WhatsApp
 * request, so those two cannot be delegated without changing
 * lib/social/agent's OwnerContext contract — which this task must not do
 * ("do NOT destabilize the Social Autopilot agent"). They are therefore
 * NOT exposed here; see docs/architecture/WHATSAPP_AGENT_CHANNEL.md and the
 * capability matrix for the explicit UNAVAILABLE classification and reason.
 */
import { createSupabaseServiceClient } from "../supabase/service";
import { listAccountsService } from "../social/repositories/accounts";
import { listJobsService } from "../social/repositories/publishing";
import type { AgentTool } from "@stratxcel/agent-core";

export const SOCIAL_DELEGATION_TOOLS: AgentTool[] = [
  {
    schema: {
      name: "social_inspect_accounts",
      description: "List connected Social Autopilot accounts (platform, status, reauth state).",
      parameters: { type: "object", properties: {} },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:social",
    async execute() {
      const service = createSupabaseServiceClient();
      const accounts = await listAccountsService(service);
      return { accounts };
    },
  },
  {
    schema: {
      name: "social_inspect_jobs",
      description: "List recent Social Autopilot publishing jobs and their status.",
      parameters: { type: "object", properties: { limit: { type: "number" } } },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:social",
    async execute(_ctx, args) {
      const service = createSupabaseServiceClient();
      const limit = typeof args.limit === "number" ? Math.min(args.limit, 50) : 20;
      const jobs = await listJobsService(service, limit);
      return { jobs };
    },
  },
];
