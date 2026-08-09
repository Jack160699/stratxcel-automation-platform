"use client";

import { useEffect, useState } from "react";
import { Card, CardHeading } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { ErrorState } from "@/components/ui/Feedback";

interface PairingStatusResponse {
  linked: boolean;
  maskedPhone?: string;
  lastUsedAt?: string | null;
}

export interface WhatsAppAgentPairingCardProps {
  /** Present for the tenant-scoped Client card; omitted for the platform-
   *  staff-scoped Admin card, which resolves identity from the session
   *  alone and needs no tenant selected — see app/api/admin/whatsapp-agent/*
   *  routes, which no longer accept or require a tenantId. */
  tenantId?: string;
  pairingUrl: string;
  statusUrl: string;
  linkUrl: string;
  /** "LINK ADMIN" for staff, "LINK" for clients — see command-parser.ts. */
  linkCommandPrefix: string;
  numberDisplay: string;
}

/**
 * Shared pairing UI for both Admin Integrations and Client Integrations —
 * differs only in which routes it calls (admin vs platform prefix), the
 * LINK command format, and whether a tenantId is threaded through at all.
 * The one-time code is held only in React state: never logged (no
 * console.log of it anywhere in this component) and never persisted to
 * localStorage — it disappears on navigation/unmount, matching the build
 * brief's explicit requirement.
 */
export function WhatsAppAgentPairingCard(props: WhatsAppAgentPairingCardProps) {
  const [status, setStatus] = useState<PairingStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [pendingCode, setPendingCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [revoking, setRevoking] = useState(false);

  async function loadStatus() {
    const url = props.tenantId ? `${props.statusUrl}?tenantId=${encodeURIComponent(props.tenantId)}` : props.statusUrl;
    const res = await fetch(url);
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Failed to load WhatsApp Agent status");
      return;
    }
    setError(null);
    setStatus(body);
  }

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.tenantId]);

  async function handleLink() {
    setRequesting(true);
    setError(null);
    try {
      const res = await fetch(props.pairingUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(props.tenantId ? { tenantId: props.tenantId } : {}),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Failed to generate a pairing code");
        return;
      }
      setPendingCode({ code: body.code, expiresAt: body.expiresAt });
    } finally {
      setRequesting(false);
    }
  }

  async function handleRevoke() {
    setRevoking(true);
    setError(null);
    try {
      const res = await fetch(props.linkUrl, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(props.tenantId ? { tenantId: props.tenantId } : {}),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Failed to revoke");
        return;
      }
      setPendingCode(null);
      await loadStatus();
    } finally {
      setRevoking(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardHeading>WhatsApp Agent</CardHeading>
        <StatusChip state="success">Live</StatusChip>
      </div>
      <p className="mt-1 text-xs text-sx-text-subtle">Number: {props.numberDisplay}</p>
      {error && <ErrorState message={error} />}

      {status === null && !error && <p className="mt-2 text-xs text-sx-text-subtle">Loading…</p>}

      {status && !status.linked && !pendingCode && (
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-sx-text-subtle">My WhatsApp: Not linked</p>
          <Button variant="primary" size="sm" onClick={handleLink} disabled={requesting}>
            {requesting ? "Generating…" : "Link my WhatsApp"}
          </Button>
        </div>
      )}

      {pendingCode && (
        <Card variant="ai" className="mt-3 text-xs text-sx-text-muted">
          <p>From your WhatsApp, send:</p>
          <p className="mt-1 font-mono text-sm text-sx-text">
            {props.linkCommandPrefix} {pendingCode.code}
          </p>
          <p className="mt-1">to {props.numberDisplay}</p>
          <p className="mt-2 text-sx-text-subtle">Code expires at {new Date(pendingCode.expiresAt).toLocaleTimeString()}.</p>
        </Card>
      )}

      {status && status.linked && (
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-sx-text-subtle">My WhatsApp: Linked ({status.maskedPhone ?? "linked"})</p>
          <Button variant="secondary" size="sm" onClick={handleRevoke} disabled={revoking}>
            {revoking ? "Revoking…" : "Revoke"}
          </Button>
        </div>
      )}
    </Card>
  );
}
