import type { OwnerContext } from "../db-context";

export interface ConversationRow {
  id: string;
  account_id: string | null;
  provider: string;
  external_conversation_id: string | null;
  external_author_id: string | null;
  author_name: string | null;
  author_handle: string | null;
  source: "COMMENT" | "MESSAGE" | "MENTION";
  context: Record<string, unknown>;
  status: string;
  sentiment: string | null;
  intent: string | null;
  lead_score: number | null;
  created_at: string;
  updated_at: string;
}

export async function listConversations(ctx: OwnerContext, limit = 50): Promise<ConversationRow[]> {
  const { data } = await ctx.supabase.from("social_conversations").select("*").order("updated_at", { ascending: false }).limit(limit);
  return (data ?? []) as ConversationRow[];
}

export async function listMessagesForConversation(ctx: OwnerContext, conversationId: string) {
  const { data } = await ctx.supabase.from("social_messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true });
  return data ?? [];
}

export async function setConversationStatus(ctx: OwnerContext, id: string, status: string) {
  await ctx.supabase.from("social_conversations").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
}

export async function listLeads(ctx: OwnerContext, limit = 50) {
  const { data } = await ctx.supabase.from("social_leads").select("*").order("created_at", { ascending: false }).limit(limit);
  return data ?? [];
}
