import type { ValueLedgerService } from "../../../../lib/reporting/value-ledger.ts";
import { valueLedgerService } from "../../../../lib/reporting/value-ledger.ts";

export type CopilotIntent =
  | "ASK_TODAYS_WORK"
  | "ASK_CURRENT_PLAN"
  | "ASK_RECOMMENDATION_REASON"
  | "ASK_WHATS_NEXT"
  | "COMMAND_EXECUTE"
  | "COMMAND_APPROVE"
  | "COMMAND_PAUSE"
  | "GENERAL_QUERY";

export interface CopilotContext {
  tenantId: string;
  businessName: string;
  customerName?: string;
  activePlan: {
    tier: "Standard" | "Premium" | "Free";
    title: string;
    monthlyPriceRupees: number;
    entitledServices: string[];
  };
  pendingApprovals?: Array<{ id: string; title: string; kind: string }>;
  ledger?: ValueLedgerService;
}

export interface CopilotResponse {
  intent: CopilotIntent;
  replyText: string;
  actionTaken?: {
    type: "APPROVAL_RECORDED" | "UPGRADE_REQUIRED" | "ACTION_QUEUED" | "INFO_RETURNED";
    details?: Record<string, unknown>;
  };
}

/**
 * Classifies customer WhatsApp message into a structured intent.
 */
export function classifyCopilotIntent(message: string): CopilotIntent {
  const m = message.toLowerCase().trim();

  if (/today|did you do today|what was done|daily update|work done/i.test(m)) {
    return "ASK_TODAYS_WORK";
  }
  if (/current plan|my plan|how much.*paying|subscription price|monthly fee|cost/i.test(m)) {
    return "ASK_CURRENT_PLAN";
  }
  if (/why.*recommend|why this plan|why google|why seo|why review/i.test(m)) {
    return "ASK_RECOMMENDATION_REASON";
  }
  if (/next|upcoming|what.*planned|what is next/i.test(m)) {
    return "ASK_WHATS_NEXT";
  }
  if (/^approve\b|yes approve|looks good.*approve|i approve/i.test(m)) {
    return "COMMAND_APPROVE";
  }
  if (/pause|stop|hold/i.test(m)) {
    return "COMMAND_PAUSE";
  }
  if (/create|post|publish|generate|run|schedule|send/i.test(m)) {
    return "COMMAND_EXECUTE";
  }

  return "GENERAL_QUERY";
}

/**
 * Executes Copilot reasoning and generates an authorized response.
 * Enforces tenant identity, authorization boundaries, and plan entitlements.
 */
export async function handleWhatsAppCopilotMessage(
  message: string,
  ctx: CopilotContext,
): Promise<CopilotResponse> {
  const intent = classifyCopilotIntent(message);
  const ledger = ctx.ledger ?? valueLedgerService;
  const currentMonth = new Date().toISOString().slice(0, 7);

  switch (intent) {
    case "ASK_TODAYS_WORK": {
      const entries = await ledger.listEntriesForMonth(ctx.tenantId, currentMonth);
      if (entries.length === 0) {
        return {
          intent,
          replyText: `Hello! Today StratXcel monitored your active growth systems. All local discovery and WhatsApp automations are operating normally for ${ctx.businessName}. No manual actions required.`,
          actionTaken: { type: "INFO_RETURNED" },
        };
      }
      const latest = entries.slice(-2);
      const itemsList = latest.map((e) => `• ${e.deliverableTitle}: ${e.deliverableSummary}`).join("\n");
      return {
        intent,
        replyText: `Here is the latest work executed for ${ctx.businessName}:\n\n${itemsList}\n\nEverything is running autonomously on your active ${ctx.activePlan.title}.`,
        actionTaken: { type: "INFO_RETURNED" },
      };
    }

    case "ASK_CURRENT_PLAN": {
      const servicesList = ctx.activePlan.entitledServices.map((s) => `• ${s.replace(/_/g, " ")}`).join("\n");
      return {
        intent,
        replyText: `Your current active plan is the *${ctx.activePlan.title}* at *₹${ctx.activePlan.monthlyPriceRupees.toLocaleString("en-IN")}/month*.\n\nIncluded Entitlements:\n${servicesList}\n\nYour next monthly value report will be generated on the 26th.`,
        actionTaken: { type: "INFO_RETURNED" },
      };
    }

    case "ASK_RECOMMENDATION_REASON": {
      return {
        intent,
        replyText: `We recommended your current setup based on your business profile (${ctx.businessName}):\n\n1. *Local Discovery*: High-intent local searches bring ready-to-buy nearby customers.\n2. *Reviews & Trust*: 5-star ratings increase conversion confidence.\n3. *Instant WhatsApp*: Captures leads instantly before they go to competitors.\n\nWe deliberately excluded unneeded ad overhead to maximize your ROI.`,
        actionTaken: { type: "INFO_RETURNED" },
      };
    }

    case "ASK_WHATS_NEXT": {
      return {
        intent,
        replyText: `Upcoming focus for ${ctx.businessName}:\n\n1. Weekly Google Business local rank optimization\n2. Customer review generation check\n3. 26th monthly performance & value recap\n\nAll tasks will execute autonomously under your plan.`,
        actionTaken: { type: "INFO_RETURNED" },
      };
    }

    case "COMMAND_APPROVE": {
      const pending = ctx.pendingApprovals ?? [];
      if (pending.length === 0) {
        return {
          intent,
          replyText: `Thank you! You currently have no pending items waiting for approval. Everything scheduled is running automatically.`,
          actionTaken: { type: "INFO_RETURNED" },
        };
      }
      const approved = pending[0]!;
      return {
        intent,
        replyText: `✅ Approved: *${approved.title}*. Our workforce will now proceed with autonomous execution.`,
        actionTaken: {
          type: "APPROVAL_RECORDED",
          details: { approvalId: approved.id, status: "APPROVED" },
        },
      };
    }

    case "COMMAND_EXECUTE": {
      // Check requested capability against active plan entitlements
      const isSocialRequested = /post|instagram|facebook|social/i.test(message);
      const isEntitledToSocial = ctx.activePlan.entitledServices.includes("social_autopilot");

      if (isSocialRequested && !isEntitledToSocial) {
        return {
          intent,
          replyText: `⚠️ *Social Autopilot is not included in your current plan (${ctx.activePlan.title})*.\n\nYour current plan focuses on Google Maps discovery and WhatsApp lead reception. If you'd like to activate autonomous social posting and creative designs, you can upgrade to the *Recommended Premium Plan*. Would you like details on upgrading?`,
          actionTaken: {
            type: "UPGRADE_REQUIRED",
            details: { requestedService: "social_autopilot" },
          },
        };
      }

      return {
        intent,
        replyText: `Your request has been scheduled with the StratXcel Workforce. We will notify you here as soon as it is completed.`,
        actionTaken: {
          type: "ACTION_QUEUED",
          details: { request: message },
        },
      };
    }

    default: {
      return {
        intent: "GENERAL_QUERY",
        replyText: `Hi! I'm your StratXcel Growth Copilot for ${ctx.businessName}. You can ask me about today's work, your active plan, upcoming tasks, or approve pending campaigns directly here on WhatsApp. How can I help you today?`,
        actionTaken: { type: "INFO_RETURNED" },
      };
    }
  }
}
