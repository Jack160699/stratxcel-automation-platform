import { stripInternalInput } from "@/lib/social/agent/dependencies";
import { PUBLISH_INTENT_TOOLS, platformLabel } from "@/lib/social/agent/publish-outcome-classify";
import { AgentMarkdown } from "./AgentMarkdown";
import { PublishApprovalGroup } from "./PublishApprovalCard";

export interface PublishReceiptData {
  platform?: string;
  accountLabel?: string;
  permalink?: string;
  externalPostId?: string;
  publishedAt?: string | null;
}

export interface AgentMessageData {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  parts: Array<{
    type: string;
    actions?: Array<{ id: string; tool: string; input: Record<string, unknown> }>;
    attachments?: AgentAttachmentData[];
  } & Partial<PublishReceiptData>>;
}

export interface AgentAttachmentData {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  processingStatus: "UPLOADED" | "EXTRACTED" | "STORED_UNREADABLE" | "FAILED";
  mediaAssetId?: string | null;
}

const ACTION_TITLES: Record<string, string> = {
  create_content_item: "Create content master",
  create_content_variant: "Create platform post",
  create_campaign: "Create campaign",
  schedule_post: "Schedule post",
  cancel_scheduled_post: "Cancel scheduled post",
  set_operating_mode: "Change operating mode",
  attach_media_to_content: "Attach media",
  update_content_variant: "Update content variant",
  execute_youtube_verification: "Upload YouTube verification video",
  execute_private_youtube_verification: "Upload private YouTube verification video",
};

function text(input: Record<string, unknown>, key: string) {
  return typeof input[key] === "string" ? String(input[key]) : "";
}

function verificationVisibility(tool: string, input: Record<string, unknown>) {
  if (tool === "execute_private_youtube_verification") return "PRIVATE";
  if (tool !== "execute_youtube_verification") return "";
  const privacy = text(input, "privacyStatus");
  if (privacy === "private") return "PRIVATE";
  if (privacy === "unlisted") return "UNLISTED";
  return "";
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
  const visibility = verificationVisibility(action.tool, input);
  return (
    <section className="saut-approval-card" aria-label={`Review required: ${title}`}>
      <div className="saut-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--saut-warning)" }}>Review required</div>
      <div className="mt-1 text-sm font-semibold" style={{ color: "var(--saut-text)" }}>{title}</div>
      {headline && <div className="mt-2 text-[13px]" style={{ color: "var(--saut-text-muted)" }}>{headline}</div>}
      {visibility && (
        <div className="mt-2 text-xs" style={{ color: "var(--saut-text-subtle)" }}>
          YouTube{" "}
          <span style={{ color: "var(--saut-text)" }}>Visibility: {visibility}</span>
        </div>
      )}
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

function PublishReceiptCard({ receipt }: { receipt: PublishReceiptData }) {
  const when = receipt.publishedAt ? new Date(receipt.publishedAt) : null;
  return (
    <section className="saut-publish-receipt" aria-label="Publishing receipt">
      <div className="saut-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--saut-success)" }}>Published</div>
      <div className="mt-1 text-sm font-semibold">{receipt.platform ? platformLabel(receipt.platform) : "Live"}</div>
      {receipt.accountLabel && <div className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>{receipt.accountLabel}</div>}
      {when && !Number.isNaN(when.getTime()) && (
        <div className="mt-2 text-xs" style={{ color: "var(--saut-text-subtle)" }}>
          Published at {when.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </div>
      )}
      {receipt.permalink ? (
        <a href={receipt.permalink} target="_blank" rel="noreferrer" className="saut-btn saut-btn-secondary mt-3 inline-flex text-xs">
          View live post
        </a>
      ) : receipt.externalPostId ? (
        <p className="mt-2 text-xs" style={{ color: "var(--saut-text-subtle)" }}>Provider post ID: {receipt.externalPostId}</p>
      ) : null}
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
      {message.parts.map((part, index) => {
        if (part.type === "proposed_actions" && part.actions?.length) {
          const publishActions = part.actions.filter((action) => PUBLISH_INTENT_TOOLS.has(action.tool));
          const otherActions = part.actions.filter((action) => !PUBLISH_INTENT_TOOLS.has(action.tool));
          return (
            <div key={index}>
              {publishActions.length > 0 && <PublishApprovalGroup actions={publishActions} onApprove={onApprove} onReject={onReject} />}
              {otherActions.length > 0 && (
                <div className="mt-2 space-y-2">
                  {otherActions.map((action) => (
                    <ApprovalCard key={action.id} action={action} onApprove={onApprove} onReject={onReject} />
                  ))}
                </div>
              )}
            </div>
          );
        }
        if (part.type === "publish_receipt") {
          return (
            <div key={index} className="mt-2">
              <PublishReceiptCard receipt={part} />
            </div>
          );
        }
        if (part.type === "attachments" && part.attachments?.length) {
          return (
            <div key={index} className="mt-2 flex flex-wrap gap-2">
              {part.attachments.map((attachment) => (
                <span key={attachment.id} className="saut-attachment-chip" title={`${attachment.mimeType} · ${attachment.sizeBytes.toLocaleString()} bytes`}>
                  <span aria-hidden>{"\u{1F4CE}"}</span>
                  <span className="max-w-48 truncate">{attachment.name}</span>
                  <span className="saut-mono text-[9px]" style={{ color: "var(--saut-text-subtle)" }}>
                    {attachment.processingStatus === "EXTRACTED" ? "text available" : "stored only"}
                  </span>
                </span>
              ))}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
