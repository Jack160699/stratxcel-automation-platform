"use client";

import { CopilotChat } from "@/components/agent-core/CopilotChat";
import { loadAdminCopilotThreadAction, sendAdminCopilotMessageAction } from "./actions";

/**
 * Admin Web Copilot — the SAME General Admin Agent Core/tool registry the
 * WhatsApp Admin Agent uses (see lib/agent-core/web-principal.ts). Not the
 * Social Autopilot copilot (app/admin/social/copilot) and not the client
 * mission composer.
 */
export default function AdminCopilotPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-sx-sans text-xl font-medium text-sx-text">Admin Copilot</h1>
        <p className="mt-1 text-sm text-sx-text-muted">
          Ask about clients, leads, missions, approvals, handoffs, operations, social, finance, integrations, health, or audit — the same agent and tools
          available to linked staff over WhatsApp.
        </p>
      </div>

      <CopilotChat
        title="Stratxcel Operations Agent"
        description="Real tool calls only — no fabricated answers. Mutating actions require confirmation."
        placeholder="e.g. How many leads came in today? Show open handoffs. What missions are failing?"
        loadThread={loadAdminCopilotThreadAction}
        sendMessage={sendAdminCopilotMessageAction}
      />
    </div>
  );
}
