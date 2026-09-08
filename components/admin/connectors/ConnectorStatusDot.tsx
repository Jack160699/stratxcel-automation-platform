import React from "react";

export type ConnectorVisualStatus =
  | "connected"
  | "needs_attention"
  | "not_connected"
  | "disabled"
  | "error";

export function resolveVisualStatus(rawStatus?: string | null): {
  type: ConnectorVisualStatus;
  label: string;
  dotColor: string;
  textColor: string;
} {
  const s = (rawStatus ?? "not_configured").toLowerCase();

  if (["connected", "healthy"].includes(s)) {
    return {
      type: "connected",
      label: "Connected",
      dotColor: "bg-[#5BDCA7]",
      textColor: "text-[#5BDCA7]",
    };
  }

  if (["auth_required", "auth_expired", "requires_reauth", "pending"].includes(s)) {
    return {
      type: "needs_attention",
      label: "Needs attention",
      dotColor: "bg-[#F3C55C]",
      textColor: "text-[#F3C55C]",
    };
  }

  if (["degraded", "rate_limited", "quota_exhausted", "error"].includes(s)) {
    return {
      type: "error",
      label: "Error",
      dotColor: "bg-[#FF8A90]",
      textColor: "text-[#FF8A90]",
    };
  }

  if (["disabled", "disconnected"].includes(s)) {
    return {
      type: "disabled",
      label: "Disabled",
      dotColor: "bg-sx-text-muted",
      textColor: "text-sx-text-muted",
    };
  }

  return {
    type: "not_connected",
    label: "Not connected",
    dotColor: "bg-sx-text-subtle",
    textColor: "text-sx-text-subtle",
  };
}

export function ConnectorStatusDot({
  status,
  className = "",
}: {
  status?: string | null;
  className?: string;
}) {
  const { label, dotColor, textColor } = resolveVisualStatus(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-sx-sans text-xs font-medium ${textColor} ${className}`}
    >
      <span className={`h-2 w-2 rounded-full ${dotColor}`} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
