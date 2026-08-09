"use client";

import { useState, useTransition } from "react";
import { ActionButton } from "./ActionButtons";
import type { SourceKey } from "@/lib/owner-brain/types";

interface Props {
  sourceKey: SourceKey;
  status: string;
  enabled: boolean;
  connectHref?: string;
  needsSecretEntry: boolean; // notion / github
  onToggle: (sourceKey: SourceKey, enabled: boolean) => Promise<void>;
  onDelete: (sourceKey: SourceKey) => Promise<void>;
}

/** Per-source Privacy Control Center row: connect / pause-resume / delete-source-data, plus the secure secret-entry form for Notion/GitHub (never a chat field — a plain HTTPS POST from this browser session). */
export function SourceControls({ sourceKey, status, enabled, connectHref, needsSecretEntry, onToggle, onDelete }: Props) {
  const [showSecretForm, setShowSecretForm] = useState(false);
  const [secret, setSecret] = useState("");
  const [submitting, startSubmit] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function submitSecret() {
    setError(null);
    const path = sourceKey === "notion" ? "notion" : "github";
    const res = await fetch(`/api/admin/operating-brain/connectors/${path}/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: secret }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? `Failed (HTTP ${res.status})`);
      return;
    }
    setShowSecretForm(false);
    setSecret("");
    window.location.reload();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {status !== "CONNECTED" && needsSecretEntry && !showSecretForm && (
          <ActionButton label="Connect" tone="accent" onClick={() => { setShowSecretForm(true); return Promise.resolve(); }} />
        )}
        {status !== "CONNECTED" && !needsSecretEntry && connectHref && (
          <a href={connectHref} className="rounded-sx-pill border border-[rgb(58_160_255_/_0.28)] px-2.5 py-1 font-sx-mono text-[10px] uppercase tracking-[0.06em] text-[#7CC2FF] hover:bg-sx-accent-muted">
            Connect
          </a>
        )}
        {status === "CONNECTED" && (
          <ActionButton label={enabled ? "Pause" : "Resume"} onClick={() => onToggle(sourceKey, !enabled)} />
        )}
        {!confirmingDelete ? (
          <ActionButton label="Delete data" tone="danger" onClick={() => { setConfirmingDelete(true); return Promise.resolve(); }} />
        ) : (
          <>
            <span className="text-[10.5px] text-sx-text-muted">Delete all synced data for this source?</span>
            <ActionButton
              label="Confirm delete"
              tone="danger"
              onClick={() => onDelete(sourceKey).then(() => setConfirmingDelete(false))}
            />
            <ActionButton label="Cancel" onClick={() => { setConfirmingDelete(false); return Promise.resolve(); }} />
          </>
        )}
      </div>
      {showSecretForm && (
        <div className="flex items-center gap-1.5">
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={sourceKey === "notion" ? "Notion internal integration secret" : "GitHub fine-grained PAT"}
            className="w-64 rounded-sx-sm border border-sx-border bg-sx-surface-2 px-2 py-1 text-[11px] text-sx-text"
          />
          <ActionButton label={submitting ? "…" : "Save"} tone="accent" onClick={() => new Promise<void>((resolve) => startSubmit(() => submitSecret().finally(resolve)))} />
          {error && <span className="text-[10.5px] text-[#FF8A90]">{error}</span>}
        </div>
      )}
    </div>
  );
}
