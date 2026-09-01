/**
 * Bridges another real, already-tested engine the original capability
 * audit missed: lib/owner-brain's owner_sources table -- real connection
 * status for Gmail, Google Calendar, Google Drive, Notion, GitHub, voice
 * notes, desktop companion, and chat platforms (see lib/owner-brain/types.ts's
 * SourceKey). Different scope from check_connections
 * (lib/agent-core/growth-media-tools.ts), which is customer-facing
 * (Google/GBP/Search Console/GA4/Vercel/WhatsApp/social integrations) --
 * this is the owner's OWN personal/productivity connections (mission
 * section 9's Connections requirement names GitHub and Notion explicitly,
 * neither of which check_connections covers).
 *
 * Deliberately queries owner_sources directly rather than calling
 * lib/owner-brain's own listSources() -- that function also calls
 * ensureSourceRows(), which upserts default rows for the given owner on
 * every call (idempotent, harmless, but a real WRITE). A tool declared
 * risk: "read" must stay read-only; a staff member who has never touched
 * Owner Brain honestly has zero sources configured, not silently
 * newly-provisioned ones.
 */
import type { AgentTool } from "@stratxcel/agent-core";

export const OWNER_CONNECTIONS_TOOL: AgentTool = {
  schema: {
    name: "check_owner_connections",
    description: "Real connection status for the owner's own personal/productivity sources -- Gmail, Google Calendar, Google Drive, Notion, GitHub, voice notes, desktop companion, chat platform imports. Different from check_connections (customer-facing Google Business/Search Console/GA4/Vercel/WhatsApp/social). Use for 'is our GitHub connected', 'check Notion connection', 'check owner brain sources'. Read-only -- never provisions or connects anything.",
    parameters: { type: "object", properties: {} },
  },
  mutating: false,
  risk: "read",
  requiredPermission: "agent:read:integrations",
  async execute(ctx) {
    if (ctx.principal.kind !== "staff") return { available: false, reason: "owner_brain_is_staff_only" };
    const { data, error } = await ctx.supabase
      .from("owner_sources")
      .select("source_key, display_name, category, status, enabled, last_sync_at, last_success_at, last_error")
      .eq("owner_id", ctx.principal.authUserId)
      .order("category", { ascending: true });
    if (error) return { available: false, reason: error.message };
    return { sources: data ?? [] };
  },
};
