import type { CapabilityProvider, ProviderExecuteResult } from "../providers/types.ts";
import { unknownCostUsage } from "../providers/types.ts";
import { buildCapabilityExecutionReceipt } from "./receipts.ts";
import { getCapabilityOperationClass } from "./operation-class.ts";
import { getCapabilityHost, type LooseServiceClient } from "./host.ts";

function envConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function resolveClient(): Promise<LooseServiceClient | null> {
  const host = getCapabilityHost();
  if (host.getServiceClient) return (await host.getServiceClient()) as LooseServiceClient;
  if (!envConfigured()) return null;
  const { createServiceClient } = await import("@stratxcel/whatsapp");
  return createServiceClient() as unknown as LooseServiceClient;
}

function mapSendReason(reason: string): {
  errorCategory: ProviderExecuteResult["errorCategory"];
  errorMessage: string;
} {
  switch (reason) {
    case "integration_disabled":
    case "no_active_outbound_binding":
      return { errorCategory: "AUTH_CONFIGURATION", errorMessage: reason };
    case "lead_not_found":
      return { errorCategory: "POLICY_BLOCK", errorMessage: "TENANT_FORBIDDEN" };
    case "consent_required":
    case "conversation_paused":
    case "conversation_awaiting_human":
    case "template_required_outside_service_window":
    case "template_not_approved":
      return { errorCategory: "POLICY_BLOCK", errorMessage: reason };
    case "kill_switch_active":
      return { errorCategory: "POLICY_BLOCK", errorMessage: "KILL_SWITCH_ACTIVE" };
    default:
      return { errorCategory: "PROVIDER_FAILURE", errorMessage: reason.slice(0, 500) };
  }
}

export function createWhatsAppSendProvider(): CapabilityProvider {
  return {
    key: "whatsapp-meta",
    capabilityKeys: ["whatsapp.send"],
    status: "IMPLEMENTED",
    probeReadiness: async () => {
      const client = await resolveClient();
      if (!client) {
        return {
          ready: false,
          status: "NOT_CONFIGURED",
          reasonCode: "PROVIDER_NOT_CONFIGURED",
          details: "WhatsApp service client not configured",
        };
      }
      try {
        const { getIntegrationMode } = await import("@stratxcel/whatsapp");
        const mode = getIntegrationMode("WHATSAPP_INTEGRATION_MODE");
        if (mode === "disabled") {
          return {
            ready: false,
            status: "NOT_CONFIGURED",
            reasonCode: "PROVIDER_NOT_CONFIGURED",
            details: "WHATSAPP_INTEGRATION_MODE=disabled",
          };
        }
        return {
          ready: true,
          status: "IMPLEMENTED",
          reasonCode: "READY",
          details: `whatsapp outbound path (mode=${mode})`,
        };
      } catch {
        return {
          ready: false,
          status: "NOT_CONFIGURED",
          reasonCode: "PROVIDER_NOT_CONFIGURED",
          details: "WhatsApp integration mode unavailable",
        };
      }
    },
    execute: async (input): Promise<ProviderExecuteResult> => {
      const client = await resolveClient();
      if (!client) {
        return {
          ok: false,
          providerKey: "whatsapp-meta",
          errorCategory: "AUTH_CONFIGURATION",
          errorMessage: "WhatsApp service client not configured",
          usage: unknownCostUsage({ requests: 0 }),
        };
      }

      const leadId = typeof input.input?.leadId === "string" ? input.input.leadId : null;
      const body = typeof input.input?.body === "string" ? input.input.body.trim() : "";
      const idempotencyKey =
        typeof input.input?.idempotencyKey === "string" && input.input.idempotencyKey.trim()
          ? input.input.idempotencyKey.trim()
          : null;

      if (!leadId || !body || !idempotencyKey) {
        return {
          ok: false,
          providerKey: "whatsapp-meta",
          errorCategory: "INVALID_INPUT",
          errorMessage: "whatsapp.send requires leadId, body, and idempotencyKey",
          usage: unknownCostUsage({ requests: 0 }),
        };
      }

      if (typeof input.input?.tenantId === "string" && input.input.tenantId !== input.tenantId) {
        return {
          ok: false,
          providerKey: "whatsapp-meta",
          errorCategory: "POLICY_BLOCK",
          errorMessage: "TENANT_FORBIDDEN",
          usage: unknownCostUsage({ requests: 0 }),
        };
      }

      try {
        const { sendOutboundWhatsAppMessage } = await import("@stratxcel/whatsapp");
        const outcome = await sendOutboundWhatsAppMessage(client as never, {
          tenantId: input.tenantId,
          leadId,
          body: body.slice(0, 4000),
          idempotencyKey,
          templateId: typeof input.input?.templateId === "string" ? input.input.templateId : null,
          templateName:
            typeof input.input?.templateName === "string" ? input.input.templateName : null,
          templateLanguage:
            typeof input.input?.templateLanguage === "string"
              ? input.input.templateLanguage
              : null,
          templateParams: Array.isArray(input.input?.templateParams)
            ? (input.input.templateParams as string[])
            : undefined,
          isHumanInitiated: input.input?.isHumanInitiated === true,
        });

        if (!outcome.ok) {
          const mapped = mapSendReason(outcome.reason);
          return {
            ok: false,
            providerKey: "whatsapp-meta",
            errorCategory: mapped.errorCategory,
            errorMessage: mapped.errorMessage,
            usage: unknownCostUsage({ requests: 0 }),
          };
        }

        const deliveryStatus = outcome.alreadySent
          ? "SENT"
          : outcome.mode === "shadow"
            ? "QUEUED"
            : "SENT";

        const receipt = buildCapabilityExecutionReceipt({
          capability: "whatsapp.send",
          tenantId: input.tenantId,
          missionId: input.missionId,
          requestId: input.requestId,
          providerKey: "whatsapp-meta",
          operationClass: getCapabilityOperationClass("whatsapp.send"),
          externalMutation: true,
          externalMutationOccurred: !outcome.alreadySent && outcome.mode === "live",
          shadowPreventedMutation: !outcome.alreadySent && outcome.mode === "shadow",
          approvalUsed: true,
          idempotencyKey,
          inputArtifactIds: input.inputArtifactIds,
          outputArtifactIds: [outcome.messageId],
          integrationKey: "whatsapp_binding",
          providerExternalId: outcome.alreadySent ? null : outcome.providerId,
          detail: {
            kind: "whatsapp_send_receipt",
            messageId: outcome.messageId,
            deliveryStatus,
            alreadySent: outcome.alreadySent,
            mode: outcome.alreadySent ? null : outcome.mode,
            delivered: false,
          },
        });

        return {
          ok: true,
          providerKey: "whatsapp-meta",
          providerReference: outcome.messageId,
          outputArtifactIds: [outcome.messageId],
          usage: unknownCostUsage({ requests: 1 }),
          receipt,
        };
      } catch (err) {
        return {
          ok: false,
          providerKey: "whatsapp-meta",
          errorCategory: "PROVIDER_FAILURE",
          errorMessage: (err instanceof Error ? err.message : String(err)).slice(0, 500),
          usage: unknownCostUsage({ requests: 0 }),
        };
      }
    },
  };
}
