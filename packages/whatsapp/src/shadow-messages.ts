import type { ServiceClient } from "./db.ts";

export interface WhatsAppShadowMessageRow {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  direction: "inbound" | "outbound_shadow";
  body: string;
  would_send: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Backs the admin dashboard's "WhatsApp shadow messages" view — the
 * proposed responses @stratxcel/whatsapp's conversation processor writes
 * via recordShadowResponse (see conversation/process-inbound.ts), never
 * actually sent, shown here with their confidence/rulePath/executionTrace
 * so an operator can compare proposed-vs-legacy behavior.
 */
export async function listShadowMessagesForTenant(
  supabase: ServiceClient,
  tenantId: string,
  limit = 100
): Promise<WhatsAppShadowMessageRow[]> {
  const { data, error } = await supabase
    .from("whatsapp_shadow_messages")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listShadowMessagesForTenant: ${error.message}`);
  return (data ?? []) as WhatsAppShadowMessageRow[];
}
