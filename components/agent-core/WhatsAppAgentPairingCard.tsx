"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardHeading } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { ErrorState } from "@/components/ui/Feedback";

interface Capability { name: string; risk: "read" | "low_mutation" | "external_mutation" | "high_risk" }
interface PairingStatusResponse {
  linked: boolean; maskedPhone?: string; lastUsedAt?: string | null; verifiedAt?: string;
  principalType?: string; identity?: { displayName?: string | null; email?: string | null };
  role?: string; department?: string | null; accessProfile?: string; capabilities?: Capability[];
  connectionHealth?: string; channelStatus?: string; recentActivity?: Array<{ kind: string; at: string }>;
}

export interface WhatsAppAgentPairingCardProps {
  tenantId?: string; pairingUrl: string; statusUrl: string; linkUrl: string;
  linkCommandPrefix: string; numberDisplay: string; resetUrl?: string;
}

export function WhatsAppAgentPairingCard(props: WhatsAppAgentPairingCardProps) {
  const [status, setStatus] = useState<PairingStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [pendingCode, setPendingCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const previousLinked = useRef(false);

  const loadStatus = useCallback(async () => {
    const url = props.tenantId ? `${props.statusUrl}?tenantId=${encodeURIComponent(props.tenantId)}` : props.statusUrl;
    const res = await fetch(url, { cache: "no-store" });
    const body = await res.json();
    if (!res.ok) { setError(body.error ?? "Failed to load WhatsApp Agent status"); return null; }
    setError(null);
    setStatus(body);
    if (body.linked && !previousLinked.current && pendingCode) {
      setPendingCode(null); // plaintext code is removed immediately on successful LINK detection
      setNotice("WhatsApp Agent connected successfully.");
    }
    previousLinked.current = Boolean(body.linked);
    return body as PairingStatusResponse;
  }, [pendingCode, props.statusUrl, props.tenantId]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  useEffect(() => {
    if (!pendingCode) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expiresAt = new Date(pendingCode.expiresAt).getTime();
    const poll = async () => {
      if (cancelled) return;
      if (Date.now() >= expiresAt) { setPendingCode(null); setNotice("Pairing code expired. Generate a new code to continue."); return; }
      const latest = await loadStatus();
      if (!cancelled && !latest?.linked) timer = setTimeout(poll, 2000);
    };
    timer = setTimeout(poll, 2000);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [pendingCode, loadStatus]);

  async function handleLink() {
    setRequesting(true); setError(null); setNotice(null);
    try {
      const res = await fetch(props.pairingUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(props.tenantId ? { tenantId: props.tenantId } : {}) });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? "Failed to generate a pairing code"); return; }
      previousLinked.current = false;
      setPendingCode({ code: body.code, expiresAt: body.expiresAt });
    } finally { setRequesting(false); }
  }

  async function requestAction(url: string, method: "POST" | "DELETE", success: string) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(props.tenantId ? { tenantId: props.tenantId } : {}) });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? "Action failed"); return; }
      setPendingCode(null); setNotice(success); await loadStatus();
    } finally { setBusy(false); }
  }

  return <Card className="overflow-hidden">
    {notice && <div role="status" aria-live="polite" className="mb-4 rounded-sx-sm border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{notice}</div>}
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-[11px] font-medium uppercase tracking-[0.16em] text-sx-text-subtle">My WhatsApp Agent</p><CardHeading>{status?.linked ? "Connected" : "Secure account link"}</CardHeading><p className="mt-1 text-xs text-sx-text-subtle">Business number: {props.numberDisplay}</p></div>
      <StatusChip state={status?.linked ? "success" : "neutral"}>{status?.linked ? "Connected · Live" : "Not connected"}</StatusChip>
    </div>
    {error && <div className="mt-3"><ErrorState message={error} /></div>}
    {!status && !error && <p className="mt-3 text-xs text-sx-text-subtle">Loading…</p>}
    {status && !status.linked && !pendingCode && <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-sx-text-muted">Link the WhatsApp number you control to this authenticated account.</p><Button variant="primary" onClick={handleLink} disabled={requesting}>{requesting ? "Generating…" : "Link my WhatsApp"}</Button></div>}
    {pendingCode && <Card variant="ai" className="mt-4 text-xs text-sx-text-muted"><p>From your WhatsApp, send:</p><p className="mt-2 font-mono text-base text-sx-text">{props.linkCommandPrefix} {pendingCode.code}</p><p className="mt-1">to {props.numberDisplay}</p><p className="mt-3 text-sx-text-subtle">Expires {new Date(pendingCode.expiresAt).toLocaleTimeString()}. This page checks securely every 2 seconds.</p><Button className="mt-3" variant="secondary" size="sm" onClick={() => void loadStatus()}>Refresh status</Button></Card>}
    {status?.linked && <ConnectedDetails status={status} busy={busy} onRefresh={() => void loadStatus()} onReset={props.resetUrl ? () => void requestAction(props.resetUrl!, "POST", "Conversation reset. Your account link is unchanged.") : undefined} onRevoke={() => void requestAction(props.linkUrl, "DELETE", "WhatsApp Agent access revoked.")} onTest={() => setNotice("Open WhatsApp and ask “What needs my attention today?” or send HELP.")} />}
  </Card>;
}

function ConnectedDetails({ status, busy, onRefresh, onReset, onRevoke, onTest }: { status: PairingStatusResponse; busy: boolean; onRefresh: () => void; onReset?: () => void; onRevoke: () => void; onTest: () => void }) {
  const reads = status.capabilities?.filter((c) => c.risk === "read") ?? [];
  const confirms = status.capabilities?.filter((c) => c.risk === "low_mutation") ?? [];
  return <div className="mt-5 space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Info label="Identity" value={status.identity?.displayName || status.identity?.email || "Authenticated account"} detail={status.identity?.email ?? undefined} /><Info label="Principal" value={humanize(status.principalType) || "Staff"} detail={humanize(status.role)} /><Info label="Department & access" value={humanize(status.department) || "Not assigned"} detail={humanize(status.accessProfile) || "Role default"} /><Info label="Connection" value={status.maskedPhone ?? "Linked"} detail={`Verified ${date(status.verifiedAt)} · ${humanize(status.connectionHealth)}`} /></div>
    <div className="grid gap-3 lg:grid-cols-3"><Group title="Available reads" items={reads.map((c) => c.name)} /><Group title="Confirmation required" items={confirms.map((c) => c.name)} /><Group title="Dashboard only" items={["Security and access", "Payments", "Destructive or infrastructure actions"]} /></div>
    <div className="rounded-sx-sm border border-sx-border p-3"><p className="text-xs font-medium text-sx-text">Recent activity</p><p className="mt-1 text-xs text-sx-text-subtle">Last used {date(status.lastUsedAt)} · Channel {humanize(status.channelStatus) || "Live"}</p></div>
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={onRefresh}>Refresh</Button><Button size="sm" variant="secondary" onClick={onTest}>Test Agent</Button>{onReset && <Button size="sm" variant="secondary" onClick={onReset} disabled={busy}>Reset conversation</Button>}<Button size="sm" variant="danger" onClick={onRevoke} disabled={busy}>Revoke WhatsApp</Button></div>
  </div>;
}
function humanize(value?: string | null) { return value ? value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()) : ""; }
function date(value?: string | null) { return value ? new Date(value).toLocaleString() : "—"; }
function Info({ label, value, detail }: { label: string; value: string; detail?: string }) { return <div className="rounded-sx-sm border border-sx-border p-3"><p className="text-[10px] uppercase tracking-wider text-sx-text-subtle">{label}</p><p className="mt-1 text-sm font-medium text-sx-text">{value}</p>{detail && <p className="mt-1 break-words text-xs text-sx-text-subtle">{detail}</p>}</div>; }
function Group({ title, items }: { title: string; items: string[] }) { return <div className="rounded-sx-sm bg-sx-surface-2 p-3"><p className="text-xs font-medium text-sx-text">{title}</p><p className="mt-2 text-xs leading-5 text-sx-text-subtle">{items.length ? items.join(" · ") : "None"}</p></div>; }
