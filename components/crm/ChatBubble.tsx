import type { CrmMessage } from "./types";

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

/** One message bubble. Inbound (customer) always left, outbound (Stratxcel/staff) always right — never inferred from anything but `direction`, so this can never mislabel a real customer message as ours or vice versa. */
export function ChatBubble({ message }: { message: CrmMessage }) {
  const outbound = message.direction === "outbound";
  return (
    <div className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[min(560px,80%)] rounded-sx-md px-3 py-2 text-[14.5px] leading-relaxed ${
          outbound
            ? "rounded-br-sx-xs bg-[rgb(53_201_140_/_0.14)] text-sx-text"
            : "rounded-bl-sx-xs bg-sx-surface-3 text-sx-text"
        } ${message.status === "failed" ? "border border-[rgb(242_86_95_/_0.4)]" : ""}`}
      >
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        <div className={`mt-1 flex items-center gap-1 ${outbound ? "justify-end" : "justify-start"}`}>
          <span className="font-sx-mono text-[10.5px] text-sx-text-subtle">{TIME_FORMAT.format(new Date(message.created_at))}</span>
          {outbound && <DeliveryMark status={message.status} />}
        </div>
      </div>
    </div>
  );
}

/** Compact delivery-state indicator for an outbound message — mirrors familiar WhatsApp-style semantics (clock -> one check -> two checks -> accent two checks) but never relies on color alone; the accessible name always carries the actual state. */
function DeliveryMark({ status }: { status: CrmMessage["status"] }) {
  const label =
    status === "failed" ? "Failed to send" : status === "read" ? "Read" : status === "delivered" ? "Delivered" : status === "sent" || status === "submitted" ? "Sent" : "Queued";

  if (status === "failed") {
    return (
      <span title={label} aria-label={label} className="text-[11px] text-[#FF8A90]">
        !
      </span>
    );
  }
  if (status === "queued") {
    return (
      <span title={label} aria-label={label} className="text-sx-text-subtle">
        <ClockIcon />
      </span>
    );
  }
  const read = status === "read";
  return (
    <span title={label} aria-label={label} className={read ? "text-sx-accent" : "text-sx-text-subtle"}>
      {status === "sent" || status === "submitted" ? <SingleCheckIcon /> : <DoubleCheckIcon />}
    </span>
  );
}

function ClockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
      <circle cx="7" cy="7" r="5.5" />
      <path d="M7 4v3.2l2.2 1.3" />
    </svg>
  );
}
function SingleCheckIcon() {
  return (
    <svg width="13" height="11" viewBox="0 0 16 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 7.5l4 4L14 3" />
    </svg>
  );
}
function DoubleCheckIcon() {
  return (
    <svg width="17" height="11" viewBox="0 0 20 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 7.5l4 4L15 3" />
      <path d="M7 7.5l4 4L20 3" />
    </svg>
  );
}
