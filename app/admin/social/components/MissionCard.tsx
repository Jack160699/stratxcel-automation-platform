"use client";

import { useState } from "react";
import { StatusBadge, toneForLabel } from "./StatusBadge";

const TRUNCATE_AT = 140;

function fmt(iso: string) {
  return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
}

export function MissionCard({
  status,
  title,
  createdAt,
  updatedAt,
}: {
  status: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const label = status.replace(/_/g, " ").toUpperCase();
  const isLong = title.length > TRUNCATE_AT;
  const shown = expanded || !isLong ? title : `${title.slice(0, TRUNCATE_AT)}…`;
  const isActive = status === "RUNNING" || status === "IN_PROGRESS";

  return (
    <div className="flex flex-col gap-2.5">
      <StatusBadge label={label} tone={toneForLabel(label)} pulse={isActive} />
      <p className="text-sm leading-relaxed" style={{ color: "var(--saut-text)" }}>
        {shown}{" "}
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs underline"
            style={{ color: "var(--saut-accent)" }}
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </p>
      <div className="saut-mono flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--saut-text-subtle)" }}>
        <span>Started {fmt(createdAt)}</span>
        <span>Updated {fmt(updatedAt)}</span>
      </div>
    </div>
  );
}
