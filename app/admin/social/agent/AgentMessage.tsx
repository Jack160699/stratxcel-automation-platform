import { AgentMarkdown } from "./AgentMarkdown";

export interface AgentMessageData {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  parts: Array<{ type: string; actions?: Array<{ id: string; tool: string; input: Record<string, unknown> }> }>;
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
    <div className="max-w-[85%]" style={isUser ? { marginLeft: "auto" } : undefined}>
      <div
        className="rounded-lg px-3.5 py-2.5"
        style={
          isUser
            ? { background: "var(--saut-accent-muted)" }
            : { background: "var(--saut-surface-2)", border: "1px solid var(--saut-border)" }
        }
      >
        {isUser ? (
          <p className="text-sm leading-relaxed" style={{ color: "var(--saut-text)" }}>
            {message.content}
          </p>
        ) : (
          <AgentMarkdown content={message.content} />
        )}
      </div>

      {message.parts.map((part, i) =>
        part.type === "proposed_actions" && part.actions?.length ? (
          <div key={i} className="mt-2 space-y-2">
            {part.actions.map((a) => (
              <div key={a.id} className="saut-card-2 p-3 text-xs">
                <div className="saut-mono mb-1.5 uppercase tracking-wide" style={{ color: "var(--saut-warning)" }}>
                  Needs approval · {a.tool}
                </div>
                <pre className="mb-2.5 overflow-x-auto whitespace-pre-wrap break-all" style={{ color: "var(--saut-text-muted)" }}>
                  {JSON.stringify(a.input, null, 2)}
                </pre>
                <div className="flex gap-2">
                  <button onClick={() => onApprove(a.id)} className="saut-btn saut-btn-primary !h-7 !px-2.5 text-[11px]">
                    Approve
                  </button>
                  <button onClick={() => onReject(a.id)} className="saut-btn saut-btn-ghost !h-7 !px-2.5 text-[11px]">
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null
      )}
    </div>
  );
}
