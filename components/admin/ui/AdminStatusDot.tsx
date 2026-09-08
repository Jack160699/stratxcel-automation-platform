"use client";

export type AdminStatusType =
  | "connected"
  | "healthy"
  | "running"
  | "waiting"
  | "needs_attention"
  | "paused"
  | "disabled"
  | "error"
  | "not_configured";

interface StatusConfig {
  label: string;
  dotColor: string;
  badgeBg: string;
  badgeBorder: string;
  textColor: string;
  pulse?: boolean;
}

const STATUS_CONFIGS: Record<AdminStatusType, StatusConfig> = {
  connected: {
    label: "Connected",
    dotColor: "bg-[#5BDCA7]",
    badgeBg: "bg-[#5BDCA7]/10",
    badgeBorder: "border-[#5BDCA7]/20",
    textColor: "text-[#5BDCA7]",
  },
  healthy: {
    label: "Healthy",
    dotColor: "bg-[#5BDCA7]",
    badgeBg: "bg-[#5BDCA7]/10",
    badgeBorder: "border-[#5BDCA7]/20",
    textColor: "text-[#5BDCA7]",
  },
  running: {
    label: "Running",
    dotColor: "bg-[#4FDCE5]",
    badgeBg: "bg-[#4FDCE5]/10",
    badgeBorder: "border-[#4FDCE5]/20",
    textColor: "text-[#4FDCE5]",
    pulse: true,
  },
  waiting: {
    label: "Waiting",
    dotColor: "bg-[#F3C55C]",
    badgeBg: "bg-[#F3C55C]/10",
    badgeBorder: "border-[#F3C55C]/20",
    textColor: "text-[#F3C55C]",
  },
  needs_attention: {
    label: "Needs attention",
    dotColor: "bg-[#F3C55C]",
    badgeBg: "bg-[#F3C55C]/10",
    badgeBorder: "border-[#F3C55C]/20",
    textColor: "text-[#F3C55C]",
  },
  paused: {
    label: "Paused",
    dotColor: "bg-[#7A8799]",
    badgeBg: "bg-[#7A8799]/10",
    badgeBorder: "border-[#7A8799]/20",
    textColor: "text-[#7A8799]",
  },
  disabled: {
    label: "Disabled",
    dotColor: "bg-[#7A8799]",
    badgeBg: "bg-[#7A8799]/10",
    badgeBorder: "border-[#7A8799]/20",
    textColor: "text-[#7A8799]",
  },
  error: {
    label: "Error",
    dotColor: "bg-[#FF8A90]",
    badgeBg: "bg-[#FF8A90]/10",
    badgeBorder: "border-[#FF8A90]/20",
    textColor: "text-[#FF8A90]",
  },
  not_configured: {
    label: "Not configured",
    dotColor: "bg-[#7A8799]/70",
    badgeBg: "bg-sx-surface-2",
    badgeBorder: "border-sx-border",
    textColor: "text-sx-text-subtle",
  },
};

export function AdminStatusDot({
  status,
  customLabel,
  compact = false,
}: {
  status: AdminStatusType | string;
  customLabel?: string;
  compact?: boolean;
}) {
  const normKey = (status.toLowerCase().replace(/[\s-]/g, "_") as AdminStatusType) in STATUS_CONFIGS
    ? (status.toLowerCase().replace(/[\s-]/g, "_") as AdminStatusType)
    : "not_configured";

  const cfg = STATUS_CONFIGS[normKey] ?? STATUS_CONFIGS.not_configured;
  const label = customLabel ?? cfg.label;

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-sx-text-muted" title={label}>
        <span className={`inline-block h-2 w-2 rounded-full ${cfg.dotColor} ${cfg.pulse ? "animate-pulse" : ""}`} />
        <span className="truncate">{label}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide ${cfg.badgeBg} ${cfg.badgeBorder} ${cfg.textColor}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotColor} ${cfg.pulse ? "animate-pulse" : ""}`} />
      <span>{label}</span>
    </span>
  );
}
