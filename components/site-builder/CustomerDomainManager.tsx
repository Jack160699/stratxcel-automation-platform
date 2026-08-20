"use client";

import { useState } from "react";
import type {
  CustomerDomainConnection,
  SupportedRegistrar,
} from "@stratxcel/websites-and-domains";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardHeading } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/StatusChip";

interface CustomerDomainManagerProps {
  tenantId: string;
  projectId: string;
  projectName?: string;
  existingDomain?: string | null;
  onDomainUpdated?: (domain: string | null) => void;
}

export function CustomerDomainManager({
  tenantId,
  projectId,
  projectName = "Your Website",
  existingDomain,
  onDomainUpdated,
}: CustomerDomainManagerProps) {
  const [viewState, setViewState] = useState<"idle" | "connecting" | "instructions" | "active">(
    existingDomain ? "active" : "idle"
  );
  const [domainInput, setDomainInput] = useState(existingDomain || "");
  const [selectedRegistrar, setSelectedRegistrar] = useState<SupportedRegistrar>("godaddy");
  const [connection, setConnection] = useState<CustomerDomainConnection | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [notifySaved, setNotifySaved] = useState(false);

  const registrars: Array<{ id: SupportedRegistrar; label: string }> = [
    { id: "godaddy", label: "GoDaddy" },
    { id: "namecheap", label: "Namecheap" },
    { id: "hostinger", label: "Hostinger" },
    { id: "cloudflare", label: "Cloudflare" },
    { id: "bigrock", label: "BigRock" },
    { id: "squarespace", label: "Squarespace" },
    { id: "other", label: "Other" },
  ];

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  async function handleStartConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!domainInput.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/platform/website-factory/${projectId}/domains`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          domain: domainInput.trim(),
          preferredRegistrar: selectedRegistrar,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to initiate domain connection");
        return;
      }

      setConnection(data.domain);
      setViewState("instructions");
    } catch {
      setError("Network error connecting domain");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (!connection) return;

    setVerifying(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/platform/website-factory/${projectId}/domains/${connection.id}/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Verification failed");
        return;
      }

      setConnection(data.domain);
      if (data.domain.status === "ACTIVE" || data.domain.status === "VERIFIED") {
        setViewState("active");
        onDomainUpdated?.(data.domain.normalizedDomain);
      }
    } catch {
      setError("Network error verifying DNS records");
    } finally {
      setVerifying(false);
    }
  }

  async function handleDisconnect() {
    if (!connection && !existingDomain) return;
    const domId = connection?.id || "primary";

    setLoading(true);
    try {
      await fetch(
        `/api/platform/website-factory/${projectId}/domains/${domId}/disconnect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId }),
        }
      );

      setConnection(null);
      setDomainInput("");
      setViewState("idle");
      onDomainUpdated?.(null);
    } catch {
      setError("Failed to disconnect domain");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Idle State: Option Cards */}
      {viewState === "idle" && (
        <div className="rounded-sx-lg border border-sx-border bg-sx-surface-1 p-6 shadow-sm">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-sx-text">Choose how to publish {projectName}</h3>
            <p className="mt-1 text-sm text-sx-text-muted">
              Connect a custom domain you already own, or preview using your secure Stratxcel address.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Option A: Connect Existing Domain */}
            <div
              onClick={() => setViewState("connecting")}
              className="group cursor-pointer rounded-sx-md border-2 border-sx-accent/40 bg-sx-surface-2 p-5 transition-all hover:border-sx-accent hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">🌐</span>
                <span className="rounded-full bg-sx-accent/15 px-2.5 py-0.5 text-xs font-bold text-sx-accent">
                  Recommended
                </span>
              </div>
              <h4 className="mt-3 text-base font-bold text-sx-text group-hover:text-sx-accent transition-colors">
                Connect My Existing Domain
              </h4>
              <p className="mt-1.5 text-xs text-sx-text-muted leading-relaxed">
                Use a domain you bought on GoDaddy, Namecheap, Hostinger, Cloudflare, or BigRock.
              </p>
              <div className="mt-4">
                <Button variant="primary" size="sm" className="w-full">
                  Connect Domain →
                </Button>
              </div>
            </div>

            {/* Option B: Buy New Domain (Future-Proof / Coming Soon) */}
            <div className="relative rounded-sx-md border border-sx-border bg-sx-surface-2/60 p-5 opacity-90">
              <div className="flex items-center justify-between">
                <span className="text-2xl">✨</span>
                <span className="rounded-full bg-sx-surface-3 px-2.5 py-0.5 text-xs font-semibold text-sx-text-subtle">
                  Coming Soon
                </span>
              </div>
              <h4 className="mt-3 text-base font-bold text-sx-text">
                Buy a New Domain
              </h4>
              <p className="mt-1.5 text-xs text-sx-text-muted leading-relaxed">
                Register a new .com, .in, or .store domain directly through Stratxcel.
              </p>
              <div className="mt-4">
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowNotifyModal(true)}
                >
                  Notify Me When Ready 🔔
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Connecting State: Enter Domain Name */}
      {viewState === "connecting" && (
        <Card className="border-sx-accent/30 bg-sx-surface-1 shadow-sm">
          <div className="flex items-center justify-between border-b border-sx-border pb-3 mb-4">
            <div>
              <CardHeading>Step 1: Enter your domain name</CardHeading>
              <p className="text-xs text-sx-text-muted mt-0.5">
                Type the domain you own (e.g. <code>mybrand.com</code> or <code>www.mybrand.com</code>).
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setViewState("idle")}>
              ✕ Cancel
            </Button>
          </div>

          <form onSubmit={handleStartConnect} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-sx-text mb-1.5">
                Your Domain
              </label>
              <Input
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="e.g. mybrand.com or www.mybrand.com"
                required
                className="font-mono text-sm"
              />
              <p className="mt-1.5 text-[11px] text-sx-text-subtle">
                Do not include <code>https://</code> or page URLs. We support both apex (@) and www subdomains.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-sx-text mb-1.5">
                Where is your domain registered?
              </label>
              <div className="flex flex-wrap gap-2">
                {registrars.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRegistrar(r.id)}
                    className={`rounded-sx-sm px-3 py-1.5 text-xs font-semibold transition-all ${
                      selectedRegistrar === r.id
                        ? "bg-sx-accent text-sx-accent-on shadow-sm"
                        : "border border-sx-border bg-sx-surface-2 text-sx-text hover:bg-sx-surface-3"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-sx-sm bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setViewState("idle")}>
                Back
              </Button>
              <Button variant="primary" size="sm" type="submit" disabled={loading || !domainInput.trim()}>
                {loading ? "Inspecting Domain…" : "Continue to DNS Setup →"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* 3. Instructions & Verification State */}
      {viewState === "instructions" && connection && (
        <div className="flex flex-col gap-6">
          <Card className="border-sx-accent bg-sx-surface-1 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sx-border pb-4">
              <div>
                <span className="text-xs uppercase font-bold tracking-wider text-sx-accent">
                  DNS Configuration
                </span>
                <h3 className="text-lg font-extrabold text-sx-text mt-0.5">
                  Connect {connection.domain}
                </h3>
              </div>
              <StatusChip state={connection.status === "ACTIVE" ? "success" : "warning"}>
                {connection.status.replace("_", " ")}
              </StatusChip>
            </div>

            {/* DNS Records Table */}
            <div className="mt-5 flex flex-col gap-4">
              <p className="text-sm text-sx-text font-medium">
                Add these DNS records in your domain provider ({connection.provider.toUpperCase()}):
              </p>

              <div className="overflow-x-auto rounded-sx-md border border-sx-border bg-sx-surface-2">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-sx-border bg-sx-surface-3 font-semibold text-sx-text">
                    <tr>
                      <th className="p-3">Type</th>
                      <th className="p-3">Name / Host</th>
                      <th className="p-3">Value / Target</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sx-border font-mono text-sx-text">
                    {connection.dnsInstructions.records.map((rec, idx) => (
                      <tr key={idx} className="hover:bg-sx-surface-1/40">
                        <td className="p-3 font-bold text-sx-accent">{rec.type}</td>
                        <td className="p-3 font-semibold">{rec.host}</td>
                        <td className="p-3 text-sx-text-muted break-all">{rec.value}</td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => copyToClipboard(rec.value, `rec_${idx}`)}
                            className="rounded-sx-sm border border-sx-border-strong bg-sx-surface-1 px-2.5 py-1 text-[11px] font-sans font-semibold text-sx-text hover:bg-sx-surface-3"
                          >
                            {copiedKey === `rec_${idx}` ? "Copied! ✓" : "Copy"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Step-by-Step Provider Guide */}
            <div className="mt-6 rounded-sx-md bg-sx-surface-2 p-4 border border-sx-border">
              <h4 className="text-xs font-bold uppercase tracking-wider text-sx-text-muted mb-2">
                Step-by-Step Instructions ({connection.provider.toUpperCase()})
              </h4>
              <ol className="list-decimal pl-5 text-xs text-sx-text space-y-1.5 leading-relaxed">
                {connection.dnsInstructions.steps.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            </div>

            {/* Verification Results / Messages */}
            {connection.lastVerification && (
              <div
                className={`mt-4 rounded-sx-sm p-3.5 text-xs border ${
                  connection.lastVerification.status === "SUCCESS"
                    ? "bg-green-500/10 border-green-500/30 text-green-400"
                    : connection.lastVerification.status === "PENDING"
                    ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-300"
                    : "bg-red-500/10 border-red-500/30 text-red-400"
                }`}
              >
                <div className="font-bold mb-1">
                  {connection.lastVerification.status === "SUCCESS" && "✅ DNS Verified!"}
                  {connection.lastVerification.status === "PENDING" && "⏳ Propagation in Progress"}
                  {connection.lastVerification.status === "INCORRECT" && "⚠️ Action Required"}
                </div>
                <p>{connection.lastVerification.friendlyMessage}</p>
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-sx-sm bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400">
                {error}
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-sx-border pt-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setViewState("connecting")}
              >
                ← Change Domain
              </Button>

              <div className="flex gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleVerify}
                  disabled={verifying}
                  className="font-bold shadow-md"
                >
                  {verifying ? "Checking DNS Records…" : "Verify My Domain 🔍"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* 4. Active Live Domain View */}
      {viewState === "active" && (
        <Card className="border-green-500/40 bg-gradient-to-br from-green-500/5 via-sx-surface-1 to-sx-surface-2 p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="flex h-3 w-3 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                <span className="text-xs font-bold uppercase tracking-wider text-green-400">
                  Custom Domain Active & Live
                </span>
              </div>
              <h3 className="mt-1 text-2xl font-extrabold text-sx-text font-mono">
                {connection?.domain || existingDomain || domainInput}
              </h3>
              <p className="mt-1 text-xs text-sx-text-muted">
                SSL Secured · CDN Accelerated · Automatic Renewal Verified
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <a
                href={`https://${connection?.domain || existingDomain || domainInput}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[38px] items-center rounded-sx-sm bg-sx-accent px-4 text-xs font-bold text-sx-accent-on hover:opacity-90 transition-opacity"
              >
                Open Live Website ↗
              </a>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setViewState("instructions")}
              >
                DNS Settings
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDisconnect}
                disabled={loading}
                className="text-red-400 hover:text-red-300"
              >
                Disconnect
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Future-Proof Notify Modal */}
      {showNotifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-sx-lg border border-sx-border bg-sx-surface-1 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-sx-text">Domain Marketplace Coming Soon</h3>
            <p className="mt-2 text-xs text-sx-text-muted leading-relaxed">
              We are integrating seamless domain purchasing with automatic 1-click DNS and SSL setup directly within Stratxcel.
            </p>
            {notifySaved ? (
              <div className="mt-4 rounded-sx-sm bg-green-500/10 border border-green-500/30 p-3 text-xs text-green-400">
                ✓ You&apos;re on the early access list! We&apos;ll notify you as soon as domain purchasing goes live.
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                <Input
                  type="email"
                  value={notifyEmail}
                  onChange={(e) => setNotifyEmail(e.target.value)}
                  placeholder="Enter your email"
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setNotifySaved(true)}
                  disabled={!notifyEmail.trim()}
                >
                  Notify Me
                </Button>
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowNotifyModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
