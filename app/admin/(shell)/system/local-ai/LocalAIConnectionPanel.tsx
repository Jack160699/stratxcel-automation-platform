"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardHeading, CardRow } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import type { LocalAIConnectionSummary } from "@/lib/local-ai/connection";

const POLL_MS = 10_000;

const STATUS_CHIP: Record<LocalAIConnectionSummary["status"], { label: string; state: ChipState; pulse?: boolean }> = {
  CONNECTED: { label: "Connected", state: "success" },
  RECONNECTING: { label: "Reconnecting", state: "warning", pulse: true },
  DISCONNECTED: { label: "Disconnected", state: "neutral" },
  ERROR: { label: "Error", state: "danger" },
};

function BoolChip({ value, trueLabel, falseLabel }: { value: boolean; trueLabel: string; falseLabel: string }) {
  return <StatusChip state={value ? "success" : "danger"}>{value ? trueLabel : falseLabel}</StatusChip>;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  return date.toLocaleString();
}

async function callJson<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: T }> {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = (await response.json().catch(() => ({}))) as T;
  return { ok: response.ok, status: response.status, body };
}

export function LocalAIConnectionPanel({ initialConnection }: { initialConnection: LocalAIConnectionSummary | null }) {
  const [connection, setConnection] = useState(initialConnection);
  const [pairingCode, setPairingCode] = useState("");
  const [pairing, setPairing] = useState(false);
  const [actionBusy, setActionBusy] = useState<"disconnect" | "reconnect" | "refresh" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRepair, setShowRepair] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function poll() {
      const { ok, body } = await callJson<{ connection: LocalAIConnectionSummary | null }>("/api/admin/system/local-ai/status?refresh=1");
      if (ok) setConnection(body.connection);
    }
    pollRef.current = setInterval(poll, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleConnect() {
    const code = pairingCode.trim();
    if (!code) return;
    setPairing(true);
    setError(null);
    const { ok, body } = await callJson<{ connection?: LocalAIConnectionSummary; error?: string }>("/api/admin/system/local-ai/pair", {
      method: "POST",
      body: JSON.stringify({ pairingCode: code }),
    });
    setPairing(false);
    if (!ok || !body.connection) {
      setError(body.error ?? "Pairing failed.");
      return;
    }
    setConnection(body.connection);
    setPairingCode("");
    setShowRepair(false);
  }

  async function handleDisconnect() {
    if (!connection) return;
    setActionBusy("disconnect");
    setError(null);
    const { ok, body } = await callJson<{ connection?: LocalAIConnectionSummary; error?: string }>("/api/admin/system/local-ai/disconnect", {
      method: "POST",
      body: JSON.stringify({ connectionId: connection.id }),
    });
    setActionBusy(null);
    if (!ok || !body.connection) {
      setError(body.error ?? "Disconnect failed.");
      return;
    }
    setConnection(body.connection);
  }

  async function handleReconnect() {
    if (!connection) return;
    setActionBusy("reconnect");
    setError(null);
    setConnection({ ...connection, status: "RECONNECTING" });
    const { ok, body } = await callJson<{ connection?: LocalAIConnectionSummary; error?: string }>("/api/admin/system/local-ai/reconnect", {
      method: "POST",
      body: JSON.stringify({ connectionId: connection.id }),
    });
    setActionBusy(null);
    if (!ok || !body.connection) {
      setError(body.error ?? "Reconnect failed.");
      return;
    }
    setConnection(body.connection);
  }

  async function handleRefresh() {
    setActionBusy("refresh");
    setError(null);
    const { ok, body } = await callJson<{ connection: LocalAIConnectionSummary | null }>("/api/admin/system/local-ai/status?refresh=1");
    setActionBusy(null);
    if (ok) setConnection(body.connection);
  }

  const chip = connection ? STATUS_CHIP[connection.status] : null;

  return (
    <div className="flex flex-col gap-6">
      {(!connection || showRepair) && (
        <Card variant={connection ? "nested" : "panel"}>
          <CardHeading>{connection ? "Pair a different machine" : "Connect Local AI"}</CardHeading>
          <p className="mt-1 text-sm text-sx-text-muted">
            On the Local PC, open its dashboard and click <span className="text-sx-text">Generate Code</span>. Enter that code below.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Field label="Pairing code" htmlFor="local-ai-pairing-code">
                <Input
                  id="local-ai-pairing-code"
                  value={pairingCode}
                  onChange={(e) => setPairingCode(e.target.value)}
                  placeholder="e.g. 4F2K-9QRT"
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
            </div>
            <Button variant="primary" onClick={handleConnect} disabled={pairing || !pairingCode.trim()}>
              {pairing ? "Connecting…" : "Connect"}
            </Button>
            {connection && (
              <Button variant="ghost" onClick={() => setShowRepair(false)} disabled={pairing}>
                Cancel
              </Button>
            )}
          </div>
          {error && <p className="mt-3 text-sm text-[#FF8A90]">{error}</p>}
        </Card>
      )}

      {connection && !showRepair && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardHeading>Local AI connection</CardHeading>
            {chip && (
              <StatusChip state={chip.state} pulse={chip.pulse}>
                {chip.label}
              </StatusChip>
            )}
          </div>

          <div className="mt-4 flex flex-col">
            <CardRow>
              <span className="text-sx-text-muted">Machine name</span>
              <span className="text-sx-text">{connection.machineName ?? "Unknown"}</span>
            </CardRow>
            <CardRow>
              <span className="text-sx-text-muted">Last seen</span>
              <span className="text-sx-text">{formatTimestamp(connection.lastSeenAt)}</span>
            </CardRow>
            <CardRow>
              <span className="text-sx-text-muted">Tunnel status</span>
              <BoolChip value={connection.tunnelReachable} trueLabel="Reachable" falseLabel="Unreachable" />
            </CardRow>
            <CardRow>
              <span className="text-sx-text-muted">API status</span>
              <BoolChip value={connection.apiReachable} trueLabel="Responding" falseLabel="Not responding" />
            </CardRow>
            <CardRow>
              <span className="text-sx-text-muted">Model status</span>
              <BoolChip value={connection.modelAvailable} trueLabel="Model loaded" falseLabel="No model available" />
            </CardRow>
            <CardRow>
              <span className="text-sx-text-muted">Last checked</span>
              <span className="text-sx-text">{formatTimestamp(connection.lastCheckedAt)}</span>
            </CardRow>
          </div>

          {connection.lastError && (
            <p className="mt-3 rounded-sx-sm border border-[rgb(242_86_95_/_0.3)] bg-[rgb(242_86_95_/_0.08)] px-3 py-2 text-sm text-[#FF8A90]">{connection.lastError}</p>
          )}
          {error && <p className="mt-3 text-sm text-[#FF8A90]">{error}</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={handleRefresh} disabled={actionBusy !== null}>
              {actionBusy === "refresh" ? "Checking…" : "Check now"}
            </Button>
            <Button variant="secondary" onClick={handleReconnect} disabled={actionBusy !== null}>
              {actionBusy === "reconnect" ? "Reconnecting…" : "Reconnect"}
            </Button>
            <Button variant="danger" onClick={handleDisconnect} disabled={actionBusy !== null}>
              {actionBusy === "disconnect" ? "Disconnecting…" : "Disconnect"}
            </Button>
            <Button variant="ghost" onClick={() => setShowRepair(true)} disabled={actionBusy !== null}>
              Pair a different machine
            </Button>
          </div>
          <p className="mt-3 text-xs text-sx-text-subtle">
            This page automatically re-checks the connection every {Math.round(POLL_MS / 1000)}s while open — a restart or temporary
            tunnel drop on the Local PC does not require re-entering a pairing code.
          </p>
        </Card>
      )}
    </div>
  );
}
