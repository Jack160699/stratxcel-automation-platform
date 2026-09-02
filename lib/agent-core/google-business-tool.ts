/**
 * check_google_business: real Google Business Profile reviews + connection
 * state for a tenant, for the master brief's "Check Google" / Reviews use
 * case (sections 9, 22). Read-only -- reuses the exact same real functions
 * the already-running automated Review Bot cron uses
 * (app/api/internal/search/scheduler/route.ts's runReviewBotCycle):
 * resolveAccessToken (lib/social/audit-connector-insights.ts),
 * isResolvedGbpLocationResourceName and listLocationReviews
 * (lib/social/providers/google-business.ts). Never replies to a review --
 * that's the Review Bot's own job, already live and automated; this tool
 * only lets a human ask "what's going on with our Google reviews" on
 * demand instead of waiting for the next cron pass.
 */
import type { AgentTool } from "@stratxcel/agent-core";
import { resolveAccessToken } from "@/lib/social/audit-connector-insights";
import { isResolvedGbpLocationResourceName, listLocationReviews } from "@/lib/social/providers/google-business";

function resolveTenantId(ctx: { principal: { kind: string; tenantId: string | null } }, args: Record<string, unknown>): string | null {
  if (ctx.principal.kind === "client") return ctx.principal.tenantId;
  const argTenantId = typeof args.tenantId === "string" && args.tenantId ? args.tenantId : null;
  return argTenantId ?? ctx.principal.tenantId;
}

export const GOOGLE_BUSINESS_TOOL: AgentTool = {
  schema: {
    name: "check_google_business",
    description:
      "Real Google Business Profile status and recent reviews for a tenant -- connection state, and (when connected and resolved) the most recent real reviews with star rating, reviewer name, comment, and whether each already has a reply. Read-only -- never replies to a review; the automated Review Bot already handles replies on its own schedule. Use for 'check Google', 'any new reviews', 'how's our Google Business profile'.",
    parameters: {
      type: "object",
      properties: { tenantId: { type: "string", description: "Optional -- a specific client's tenant id. Defaults to Stratxcel's own." } },
    },
  },
  mutating: false,
  risk: "read",
  requiredPermission: "agent:read:integrations",
  async execute(ctx, args) {
    const tenantId = resolveTenantId(ctx, args);
    if (!tenantId) return { available: false, reason: "no_tenant_resolved" };

    const { data: gbpAccount, error } = await ctx.supabase
      .from("social_accounts")
      .select("id, provider_account_id, status")
      .eq("tenant_id", tenantId)
      .eq("platform", "google_business")
      .maybeSingle();
    if (error) return { available: false, reason: error.message };
    if (!gbpAccount) return { available: true, connected: false, reason: "no_google_business_account_on_file" };

    const account = gbpAccount as { id: string; provider_account_id: string | null; status: string };
    if (account.status !== "CONNECTED") {
      return { available: true, connected: false, status: account.status };
    }
    if (!account.provider_account_id || !isResolvedGbpLocationResourceName(account.provider_account_id)) {
      return {
        available: true,
        connected: true,
        locationResolved: false,
        reason: "the connected account's Google location was never fully resolved -- reconnecting Google Business should fix this",
      };
    }

    const tokens = await resolveAccessToken(ctx.supabase as never, account.id);
    if (!tokens) {
      return { available: true, connected: true, locationResolved: true, reason: "stored Google access token unavailable -- may need reconnecting" };
    }

    try {
      const reviews = await listLocationReviews(tokens.accessToken, account.provider_account_id);
      const unreplied = reviews.filter((r) => !r.hasExistingReply);
      return {
        available: true,
        connected: true,
        locationResolved: true,
        reviewCount: reviews.length,
        unrepliedCount: unreplied.length,
        recentReviews: reviews.slice(0, 10).map((r) => ({
          reviewerName: r.reviewerName,
          starRating: r.starRating,
          comment: r.comment,
          createTime: r.createTime,
          hasExistingReply: r.hasExistingReply,
        })),
      };
    } catch (err) {
      return { available: true, connected: true, locationResolved: true, reason: err instanceof Error ? err.message : "reviews_fetch_failed" };
    }
  },
};
