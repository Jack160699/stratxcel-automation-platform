import { createSupabaseServiceClient } from "../../supabase/service.ts";
import { getIntegrationMode } from "../flags.ts";
import { IntegrationDisabledError, type SendWhatsAppMessageResult, type WhatsAppAdapter } from "./types.ts";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

/**
 * The one adapter implementation, branching on mode internally rather than
 * three separate classes — "disabled" and "shadow" share almost everything
 * (both never touch the network), and "live" is one extra fetch call. This
 * keeps the WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID env reads in a single
 * place that's trivially greppable, rather than scattered across
 * implementations.
 */
export function createWhatsAppAdapter(supabase: ServiceClient): WhatsAppAdapter {
  const mode = getIntegrationMode("WHATSAPP_INTEGRATION_MODE");

  return {
    mode,
    async sendMessage(input): Promise<SendWhatsAppMessageResult> {
      if (mode === "disabled") throw new IntegrationDisabledError("WhatsApp");

      if (mode === "shadow") {
        const { data, error } = await supabase
          .from("whatsapp_shadow_messages")
          .insert({
            tenant_id: input.tenantId,
            direction: "outbound_shadow",
            body: input.body,
            would_send: true,
            metadata: { to: input.to },
          })
          .select("id")
          .single();
        if (error) throw new Error(`WhatsApp shadow send failed: ${error.message}`);
        return { id: data.id as string, mode: "shadow" };
      }

      // mode === "live" — gated entirely behind the env var; not reachable
      // from any default configuration and not called anywhere in this
      // codebase yet. Requires WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID,
      // which are never read outside this branch.
      const token = process.env.WHATSAPP_TOKEN;
      const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      const apiVersion = process.env.WHATSAPP_GRAPH_API_VERSION ?? "v20.0";
      if (!token || !phoneNumberId) {
        throw new Error("WHATSAPP_INTEGRATION_MODE is 'live' but WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID are not set");
      }

      const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: input.to,
          type: "text",
          text: { body: input.body },
        }),
      });
      if (!response.ok) {
        throw new Error(`WhatsApp live send failed: HTTP ${response.status}`);
      }
      const result = (await response.json()) as { messages?: { id: string }[] };
      return { id: result.messages?.[0]?.id ?? "unknown", mode: "live" };
    },
  };
}
