import type { OwnerContext } from "../db-context";
import { CHAT_PROVIDERS, type ChatProviderKey } from "../chat/providers";

export interface OwnerChatConnectionRow {
  id: string; provider_key: ChatProviderKey; status: string; auth_mode: string; capability: string;
  enabled: boolean; retention_days: number; last_sync_at: string | null; last_success_at: string | null;
  health: Record<string, unknown>; last_error: string | null; configuration: Record<string, unknown>;
}

export async function listChatConnections(ctx: OwnerContext): Promise<OwnerChatConnectionRow[]> {
  for (const provider of CHAT_PROVIDERS) {
    await ctx.supabase.from("owner_chat_connections").upsert({
      owner_id: ctx.ownerId, provider_key: provider.key, display_name: provider.displayName,
      auth_mode: provider.authMode, capability: provider.capability,
      status: provider.supportsImport ? "IMPORT_AVAILABLE" : "AUTH_REQUIRED",
    }, { onConflict: "owner_id,provider_key", ignoreDuplicates: true });
  }
  const { data, error } = await ctx.supabase.from("owner_chat_connections").select("*").eq("owner_id", ctx.ownerId).order("created_at");
  if (error) throw new Error(`listChatConnections failed: ${error.message}`);
  return (data ?? []) as OwnerChatConnectionRow[];
}

export async function deleteChatProviderData(ctx: OwnerContext, providerKey: ChatProviderKey): Promise<void> {
  const { data: connection, error } = await ctx.supabase.from("owner_chat_connections").select("id").eq("owner_id", ctx.ownerId).eq("provider_key", providerKey).single();
  if (error) throw new Error(`deleteChatProviderData lookup failed: ${error.message}`);
  await ctx.supabase.from("owner_chat_messages").delete().eq("owner_id", ctx.ownerId).eq("connection_id", connection.id);
  await ctx.supabase.from("owner_chat_imports").delete().eq("owner_id", ctx.ownerId).eq("connection_id", connection.id);
  await ctx.supabase.from("owner_chat_connections").update({ status: "IMPORT_AVAILABLE", last_sync_at: null, last_success_at: null, health: {}, last_error: null }).eq("id", connection.id).eq("owner_id", ctx.ownerId);
}
