import type { CrmMessage } from "./types";

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

/**
 * One message bubble. Inbound (customer) always left, outbound (Stratxcel/staff) always right.
 * Strict delivery status mapping:
 * - SENT / SUBMITTED: Single check (✓) in neutral slate.
 * - DELIVERED: Double check (✓✓) in neutral slate / emerald.
 * - READ: Double check (✓✓) in WhatsApp sky cyan.
 * - QUEUED / SENDING: Clock icon in subtle slate.
 * - FAILED: Red warning indicator (⚠ Failed) + red border ONLY. Normal messages never have red styling.
 */
export function ChatBubble({ message }: { message: CrmMessage }) {
  const outbound = message.direction === "outbound";
  const isFailed = message.status === "failed";

  return (
    <div className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[min(560px,75%)] px-3.5 py-2 text-[14px] leading-relaxed transition-all shadow-sm ${
          outbound
            ? isFailed
              ? "rounded-2xl rounded-br-xs border border-red-500/40 bg-red-950/25 text-red-100 shadow-[0_1px_4px_rgba(239,68,68,0.1)]"
              : "rounded-2xl rounded-br-xs bg-emerald-950/30 border border-emerald-500/20 text-sx-text"
            : "rounded-2xl rounded-bl-xs bg-sx-surface-2 border border-sx-border text-sx-text"
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        <div className={`mt-1.5 flex items-center gap-1.5 ${outbound ? "justify-end" : "justify-start"}`}>
          <span className="font-sx-mono text-[10.5px] text-sx-text-subtle">
            {TIME_FORMAT.format(new Date(message.created_at))}
          </span>
          {outbound && <DeliveryMark status={message.status} />}
        </div>
      </div>
    </div>
  );
}

/**
 * Compact delivery-state indicator for an outbound message.
 * Employs WhatsApp-standard semantics with accessible text labels so state is never conveyed by color alone.
 */
function DeliveryMark({ status }: { status: CrmMessage["status"] }) {
  if (status === "failed") {
    return (
      <span
        title="Failed to deliver"
        aria-label="Failed to deliver"
        className="inline-flex items-center gap-1 font-sx-mono text-[10.5px] font-semibold text-[#FF8A90]"
      >
        <AlertTriangleIcon />
        <span>Failed</span>
      </span>
    );
  }

  if (status === "queued" || status === "sending") {
    return (
      <span
        title="Sending / Queued"
        aria-label="Sending"
        className="inline-flex items-center gap-1 font-sx-mono text-[10px] text-sx-text-subtle"
      >
        <ClockIcon />
      </span>
    );
  }

  if (status === "sent" || status === "submitted") {
    return (
      <span
        title="Sent"
        aria-label="Sent"
        className="inline-flex items-center gap-1 text-slate-400"
      >
        <SingleCheckIcon />
      </span>
    );
  }

  if (status === "delivered") {
    return (
      <span
        title="Delivered to device"
        aria-label="Delivered"
        className="inline-flex items-center gap-1 text-slate-300"
      >
        <DoubleCheckIcon />
      </span>
    );
  }

  if (status === "read") {
    return (
      <span
        title="Read by recipient"
        aria-label="Read"
        className="inline-flex items-center gap-1 text-sky-400"
      >
        <DoubleCheckIcon />
      </span>
    );
  }

  return null;
}

function ClockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="7" cy="7" r="5.5" />
      <path d="M7 4v3.2l2.2 1.3" />
    </svg>
  );
}

function SingleCheckIcon() {
  return (
    <svg width="13" height="11" viewBox="0 0 16 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 7.5l4 4L14 3" />
    </svg>
  );
}

function DoubleCheckIcon() {
  return (
    <svg width="17" height="11" viewBox="0 0 20 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 7.5l4 4L15 3" />
      <path d="M7 7.5l4 4L20 3" />
    </svg>
  );
}

function AlertTriangleIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
