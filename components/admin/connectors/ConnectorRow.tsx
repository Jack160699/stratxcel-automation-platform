"use client";

import React from "react";
import { ConnectorIcon } from "./ConnectorIcon";
import { ConnectorStatusDot, resolveVisualStatus } from "./ConnectorStatusDot";
import { getConnectorMeta } from "./connector-meta";

export interface ConnectorItem {
  definition: {
    key: string;
    label: string;
    category: string;
    authMethod: string;
    description: string;
    isPersonal?: boolean;
    declaredCapabilities?: string[];
  };
  connection: {
    id: string;
    status: string;
    connectedAt: string | null;
    lastHealthCheckAt: string | null;
    lastVerifiedAt?: string | null;
    budgetLimitUsd?: number | null;
    currentUsageUsd?: number;
    metadata?: Record<string, unknown> | null;
  } | null;
  health: {
    status: string;
    discoveredCapabilities: string[];
    lastError: string | null;
    lastVerifiedAt?: string | null;
    details?: Record<string, unknown>;
  };
}

export function ConnectorRow({
  item,
  onOpenDetails,
  onPrimaryAction,
}: {
  item: ConnectorItem;
  onOpenDetails: (item: ConnectorItem) => void;
  onPrimaryAction?: (item: ConnectorItem) => void;
}) {
  const { definition, health } = item;
  const meta = getConnectorMeta(definition.key, definition.label);
  const visualStatus = resolveVisualStatus(health.status);
  const isConnected = visualStatus.type === "connected";
  const isGoogleAiPro = definition.key === "google_ai_pro";

  return (
    <div
      onClick={() => onOpenDetails(item)}
      className="group relative flex items-center justify-between rounded-xl border border-sx-border/70 bg-sx-surface-1/90 px-4 py-3.5 transition-all duration-150 hover:border-sx-border-strong hover:bg-sx-surface-2/80 hover:shadow-sm cursor-pointer"
    >
      {/* Left: Icon + Info */}
      <div className="flex min-w-0 items-center gap-3.5 pr-4">
        <ConnectorIcon connectorKey={definition.key} size={38} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-sx-sans text-sm font-semibold text-sx-text group-hover:text-sx-accent transition-colors">
              {meta.name}
            </h3>

            {isGoogleAiPro && (
              <span className="rounded-full bg-sx-accent-muted/60 border border-sx-accent/30 px-2 py-0.5 text-[10px] font-semibold text-sx-accent uppercase tracking-wider">
                Founder Flagship
              </span>
            )}
          </div>

          <p className="mt-0.5 truncate font-sx-sans text-xs text-sx-text-muted">
            {meta.oneLiner}
          </p>
        </div>
      </div>

      {/* Right: Status + Eye Button + Primary Action */}
      <div
        className="flex shrink-0 items-center gap-3 sm:gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Status Indicator */}
        <ConnectorStatusDot status={health.status} />

        {/* Primary Action Button (Connect / Reconnect / Connected) */}
        {isConnected ? (
          <span className="hidden sm:inline-flex items-center rounded-md border border-sx-border/60 bg-sx-surface-2 px-2.5 py-1 text-xs font-medium text-sx-text-muted">
            Connected
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onPrimaryAction?.(item) ?? onOpenDetails(item)}
            className="inline-flex items-center rounded-lg bg-sx-accent px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90 active:scale-[0.98]"
          >
            Connect
          </button>
        )}

        {/* Eye / Details Button */}
        <button
          type="button"
          onClick={() => onOpenDetails(item)}
          aria-label={`View details for ${meta.name}`}
          title="View connector details"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-sx-border/60 bg-sx-surface-2 text-sx-text-muted transition-colors hover:border-sx-border hover:bg-sx-surface-3 hover:text-sx-text focus:outline-none focus:ring-1 focus:ring-sx-accent"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
