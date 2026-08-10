import type { ServiceClient } from "./db.ts";
import { getIntegrationMode } from "./flags.ts";
import { IntegrationDisabledError, type SendInteractiveMessageInput, type SendTemplateMessageInput, type SendWhatsAppMessageResult, type WhatsAppAdapter } from "./types.ts";

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

    async sendInteractiveMessage(input: SendInteractiveMessageInput): Promise<SendWhatsAppMessageResult> {
      if (mode === "disabled") throw new IntegrationDisabledError("WhatsApp");
      if (input.buttons.length < 1 || input.buttons.length > 3) throw new Error("WhatsApp reply buttons require between 1 and 3 choices");
      if (mode === "shadow") {
        const { data, error } = await supabase.from("whatsapp_shadow_messages").insert({
          tenant_id: input.tenantId, direction: "outbound_shadow", body: input.body, would_send: true,
          metadata: { to: input.to, interactive: true, buttons: input.buttons.map((button) => button.title) },
        }).select("id").single();
        if (error) throw new Error(`WhatsApp shadow interactive send failed: ${error.message}`);
        return { id: data.id as string, mode: "shadow" };
      }
      const token = process.env.WHATSAPP_TOKEN;
      const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      const apiVersion = process.env.WHATSAPP_GRAPH_API_VERSION ?? "v20.0";
      if (!token || !phoneNumberId) throw new Error("WhatsApp live credentials are not set");
      const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: input.to, type: "interactive", interactive: { type: "button", body: { text: input.body }, action: { buttons: input.buttons.map((button) => ({ type: "reply", reply: button })) } } }),
      });
      if (!response.ok) throw new Error(`WhatsApp live interactive send failed: HTTP ${response.status}`);
      const result = await response.json() as { messages?: { id: string }[] };
      return { id: result.messages?.[0]?.id ?? "unknown", mode: "live" };
    },

    async sendTemplateMessage(input: SendTemplateMessageInput): Promise<SendWhatsAppMessageResult> {
      if (mode === "disabled") throw new IntegrationDisabledError("WhatsApp");

      if (mode === "shadow") {
        const { data, error } = await supabase
          .from("whatsapp_shadow_messages")
          .insert({
            tenant_id: input.tenantId,
            direction: "outbound_shadow",
            body: `[template:${input.templateName}/${input.languageCode}] ${(input.bodyParams ?? []).join(", ")}`,
            would_send: true,
            metadata: { to: input.to, templateName: input.templateName, languageCode: input.languageCode },
          })
          .select("id")
          .single();
        if (error) throw new Error(`WhatsApp shadow template send failed: ${error.message}`);
        return { id: data.id as string, mode: "shadow" };
      }

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
          type: "template",
          template: {
            name: input.templateName,
            language: { code: input.languageCode },
            components:
              input.bodyParams && input.bodyParams.length > 0
                ? [{ type: "body", parameters: input.bodyParams.map((text) => ({ type: "text", text })) }]
                : undefined,
          },
        }),
      });
      if (!response.ok) {
        throw new Error(`WhatsApp live template send failed: HTTP ${response.status}`);
      }
      const result = (await response.json()) as { messages?: { id: string }[] };
      return { id: result.messages?.[0]?.id ?? "unknown", mode: "live" };
    },
  };
}
