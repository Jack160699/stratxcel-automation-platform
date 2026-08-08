import { redirect } from "next/navigation";

/**
 * /app/conversations is no longer a separate page. It used to render its
 * own shadow-message-only "WhatsApp inquiries and follow-up drafts" view,
 * duplicating (incompletely) what /app/crm now does properly with real
 * whatsapp_conversations/whatsapp_messages. Rather than maintain two
 * conversation implementations, this route redirects into the one unified
 * CRM/inbox workspace — the bookmark keeps working, it just lands on the
 * real thing now.
 */
export default function ConversationsRedirect() {
  redirect("/app/crm");
}
