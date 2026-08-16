import { redirect } from "next/navigation";

/**
 * /app/conversations is removed from the V1 client panel.
 * Redirects to the Command Center overview.
 */
export default function ConversationsRedirect() {
  redirect("/app");
}
