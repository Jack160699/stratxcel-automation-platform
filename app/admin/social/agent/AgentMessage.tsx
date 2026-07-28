import { stripInternalInput } from "@/lib/social/agent/dependencies";
import { AgentMarkdown } from "./AgentMarkdown";

export interface AgentMessageData {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  parts: Array<{ type: string; actions?: Array<{ id: string; tool: string; input: Record<string, unknown> }> }>;
}

const ACTION_TITLES: Record<string, string> = {
  create_content_item: "Create content master",
  create_content_variant: "Create platform post",
  create_campaign: "Create campaign",
  schedule_post: "Schedule post",
  cancel_scheduled_post: "Cancel scheduled post",
  set_operating_mode: "Change operating mode",
};

function text(input: Record<string, unknown>, key: string) {
  return typeof input[key] === "string" ? String(input[key]) : "";
}

function ApprovalCard({
  action,
  onApprove,
  onReject,
}: {
  action: { id: string; tool: string; input: Record<string, unknown> };
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const input = stripInternalInput(action.input);
  const title = ACTION_TITLES[action.tool] ?? action.tool.replaceAll("_", " ");
  const headline = text(input, "title") || text(input, "platform") || text(input, "name");
  const preview = text(input, "caption") || text(input, "masterIdea") || text(input, "goal");
  const hashtags = Array.isArray(input.hashtags) ? input.hashtags.map(String).join(" ") : "";
  return (
    <section className="saut-approval-card" aria-label={`Review required: ${title}`}>
      <div className="saut-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--saut-warning)" }}>Review required</div>
      <div className="mt-1 text-sm font-semibold" style={{ color: "var(--saut-text)" }}>{title}</div>
      {headline && <div className="mt-2 text-[13px]" style={{ color: "var(--saut-text-muted)" }}>{headline}</div>}
      {text(input, "contentPillar") && (
        <div className="mt-2 text-xs" style={{ color: "var(--saut-text-subtle)" }}>Pillar · {text(input, "contentPillar")}</div>
      )}
      {preview && <p className="mt-3 whitespace-pre-wrap text-[12.5px] leading-relaxed" style={{ color: "var(--saut-text)" }}>{preview}</p>}
      {hashtags && <p className="mt-2 text-xs" style={{ color: "var(--saut-ai)" }}>{hashtags}</p>}
      <details className="mt-3 text-xs">
        <summary style={{ color: "var(--saut-text-subtle)" }}>Technical details</summary>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all" style={{ color: "var(--saut-text-muted)" }}>
          {JSON.stringify(input, null, 2)}
        </pre>
      </details>
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={() => onReject(action.id)} className="saut-btn saut-btn-ghost !h-7 !px-2.5 text-[11px]">Reject</button>
        <button onClick={() => onApprove(action.id)} className="saut-btn saut-btn-primary !h-7 !px-2.5 text-[11px]">Approve</button>
      </div>
    </section>
  );
}

export function AgentMessage({
  message,
  onApprove,
  onReject,
}: {
  message: AgentMessageData;
  onApprove: (actionId: string) => void;
  onReject: (actionId: string) => void;
}) {
  const isUser = message.role === "user";
  return (
    <div className="max-w-[88%]" style={isUser ? { marginLeft: "auto" } : undefined}>
      <div
        className="rounded-lg px-3.5 py-2.5"
        style={isUser
          ? { background: "var(--saut-accent-muted)" }
          : { background: "var(--saut-surface-2)", border: "1px solid var(--saut-border)" }}
      >
        {isUser
          ? <p className="text-sm leading-relaxed" style={{ color: "var(--saut-text)" }}>{message.content}</p>
          : <AgentMarkdown content={message.content} />}
      </div>
      {message.parts.map((part, index) =>
        part.type === "proposed_actions" && part.actions?.length ? (
          <div key={index} className="mt-2 space-y-2">
            {part.actions.map((action) => (
              <ApprovalCard key={action.id} action={action} onApprove={onApprove} onReject={onReject} />
            ))}
          </div>
        ) : null
      )}
    </div>
  );
}
