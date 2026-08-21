"use client";

import { useState } from "react";
import { PlatformIcon } from "@/components/audit/PlatformIcon";
import type { SocialConnection, SocialPlatformKey } from "./types";

/**
 * StratXcel Onboarding reference's "Connect your accounts" bottom sheet —
 * optional, reachable from the Brand step and again from Review. Every
 * button here is real: Google Business/Instagram/Facebook/YouTube use the
 * exact same OAuth redirect StepConnectors.tsx used
 * (/api/social/oauth/{provider}/connect), Google Analytics/Search Console
 * share the one real Google Search OAuth grant
 * (/api/platform/search/google/connect — full property selection stays
 * available post-onboarding on /app/integrations, this sheet only
 * establishes the connection), and WhatsApp uses the real onboarding OTP
 * endpoints (send-otp/verify-otp) inline rather than a fake instant toggle.
 */

interface Row {
  key: SocialPlatformKey;
  title: string;
  detail: string;
  tint: string;
}

const PRIMARY_ROWS: Row[] = [
  { key: "google_business", title: "Google Business Profile", detail: "Maps visibility & local search", tint: "rgba(66,133,244,0.08)" },
  // "WhatsApp Number" is deliberate product wording, tested elsewhere in
  // this codebase — this verifies the phone number for OTP-based
  // notifications only, not a full messaging-platform API integration.
  { key: "whatsapp", title: "WhatsApp Number", detail: "Customer enquiries & auto-replies", tint: "rgba(37,211,102,0.08)" },
];

const SOCIAL_ROWS: Row[] = [
  { key: "instagram", title: "Instagram", detail: "Share offers & reach local customers", tint: "linear-gradient(135deg, rgba(131,58,180,0.08), rgba(253,29,29,0.06))" },
  { key: "facebook", title: "Facebook", detail: "Page updates & community reach", tint: "rgba(24,119,242,0.08)" },
  { key: "youtube", title: "YouTube", detail: "Video content & shorts", tint: "rgba(255,0,0,0.06)" },
];

const ANALYTICS_ROWS: Row[] = [
  { key: "google_analytics", title: "Google Analytics", detail: "Track website visitors", tint: "rgba(234,67,53,0.08)" },
  { key: "google_search_console", title: "Search Console", detail: "Google search ranking data", tint: "rgba(66,133,244,0.08)" },
];

function startOAuth(platform: SocialPlatformKey) {
  if (platform === "google_search_console" || platform === "google_analytics") {
    window.location.href = "/api/platform/search/google/connect?redirectTo=/app";
    return;
  }
  window.location.href = `/api/social/oauth/${platform}/connect?redirectTo=/app`;
}

export function ConnectorSheet({
  connections,
  onConnectionsChange,
  onClose,
}: {
  connections: SocialConnection[];
  onConnectionsChange: (next: SocialConnection[]) => void;
  onClose: () => void;
}) {
  const [waStep, setWaStep] = useState<"idle" | "phone" | "otp">("idle");
  const [waPhone, setWaPhone] = useState("+91 ");
  const [waOtp, setWaOtp] = useState("");
  const [waLoading, setWaLoading] = useState(false);
  const [waError, setWaError] = useState<string | null>(null);
  const [waCooldown, setWaCooldown] = useState(0);

  const isConnected = (key: SocialPlatformKey) => connections.find((c) => c.platform === key)?.status === "connected";

  async function sendWhatsappOtp() {
    setWaError(null);
    setWaLoading(true);
    try {
      const res = await fetch("/api/platform/onboarding/whatsapp/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: waPhone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWaError(data.error || "Failed to send OTP. Check the phone number.");
        return;
      }
      setWaStep("otp");
      setWaCooldown(data.cooldownSeconds || 60);
    } catch {
      setWaError("Network error sending OTP. Please try again.");
    } finally {
      setWaLoading(false);
    }
  }

  async function verifyWhatsappOtp() {
    setWaError(null);
    setWaLoading(true);
    try {
      const res = await fetch("/api/platform/onboarding/whatsapp/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: waPhone, otp: waOtp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWaError(data.error || "Invalid OTP. Check the code and retry.");
        return;
      }
      const verifiedPhone = data.verifiedNumber || waPhone;
      const next = connections.filter((c) => c.platform !== "whatsapp");
      next.push({
        platform: "whatsapp",
        handle: verifiedPhone,
        displayName: verifiedPhone,
        status: "connected",
        connectionType: "otp_verified",
        providerAccountId: verifiedPhone,
        providerLabel: "WhatsApp Verified",
        connectedAt: new Date().toISOString(),
      });
      onConnectionsChange(next);
      setWaStep("idle");
      setWaOtp("");
    } catch {
      setWaError("Network error verifying OTP. Please try again.");
    } finally {
      setWaLoading(false);
    }
  }

  function ConnectButton({ row }: { row: Row }) {
    const connected = isConnected(row.key);
    if (row.key === "whatsapp") {
      return (
        <button
          type="button"
          onClick={() => (connected ? undefined : setWaStep("phone"))}
          disabled={connected}
          className={`h-8 shrink-0 whitespace-nowrap rounded-sx-sm border-[1.5px] px-3 text-xs font-semibold ${
            connected ? "border-sx-success/20 bg-sx-success/10 text-sx-success" : "border-sx-accent bg-sx-accent text-sx-accent-on"
          }`}
        >
          {connected ? "Connected ✓" : "Connect"}
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => (connected ? undefined : startOAuth(row.key))}
        disabled={connected}
        className={`h-8 shrink-0 whitespace-nowrap rounded-sx-sm border-[1.5px] px-3 text-xs font-semibold ${
          connected ? "border-sx-success/20 bg-sx-success/10 text-sx-success" : "border-sx-accent bg-sx-accent text-sx-accent-on"
        }`}
      >
        {connected ? "Connected ✓" : "Connect"}
      </button>
    );
  }

  function ConnectorRow({ row }: { row: Row }) {
    return (
      <div data-platform={row.key} className="mb-2 flex items-center gap-3 rounded-sx-md border-[1.5px] border-sx-border bg-sx-bg p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sx-sm" style={{ background: row.tint }}>
          <PlatformIcon name={row.key === "google_search_console" ? "google_search_console" : row.key} className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-sx-text">{row.title}</p>
          <p className="truncate text-xs text-sx-text-subtle">{row.detail}</p>
        </div>
        <ConnectButton row={row} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" role="dialog" aria-modal="true" aria-label="Connect your accounts">
      <div className="max-h-[86vh] w-full overflow-y-auto rounded-t-[20px] bg-sx-surface-1 px-4 pb-8 pt-5" style={{ WebkitOverflowScrolling: "touch" }}>
        <div className="mx-auto mb-5 h-1 w-9 rounded-full bg-sx-border-strong" />
        <p className="mb-1 text-[18px] font-bold text-sx-text">Connect your accounts</p>
        <p className="mb-4.5 text-[13px] leading-relaxed text-sx-text-subtle">This is optional — connect now or any time from Settings.</p>

        {waStep !== "idle" ? (
          <div className="rounded-sx-md border-[1.5px] border-sx-accent/20 bg-sx-accent-muted p-4">
            <p className="text-[14px] font-bold text-sx-text">{waStep === "phone" ? "Verify WhatsApp Number" : "Enter the code"}</p>
            {waStep === "phone" && (
              <p className="mt-1 text-xs text-sx-text-subtle">Verify the phone number you use for WhatsApp to receive instant customer enquiries.</p>
            )}
            {waError && <p className="mt-2 text-xs text-sx-danger">{waError}</p>}
            {waStep === "phone" ? (
              <>
                <input
                  value={waPhone}
                  onChange={(e) => setWaPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="mt-3 h-11 w-full rounded-sx-sm border border-sx-border bg-sx-surface-1 px-3 text-sm text-sx-text"
                />
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => setWaStep("idle")} className="h-9 px-3 text-xs font-semibold text-sx-text-muted">Cancel</button>
                  <button type="button" onClick={() => void sendWhatsappOtp()} disabled={waLoading} className="h-9 rounded-sx-sm bg-sx-accent px-4 text-xs font-bold text-sx-accent-on">
                    {waLoading ? "Sending…" : "Send OTP"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <input
                  value={waOtp}
                  onChange={(e) => setWaOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  placeholder="6-digit code"
                  className="mt-3 h-11 w-full rounded-sx-sm border border-sx-border bg-sx-surface-1 px-3 text-center text-lg tracking-[0.3em] text-sx-text"
                />
                <div className="mt-3 flex items-center justify-between">
                  <button type="button" onClick={() => void sendWhatsappOtp()} disabled={waCooldown > 0 || waLoading} className="text-xs font-semibold text-sx-accent disabled:opacity-50">
                    {waCooldown > 0 ? `Resend in ${waCooldown}s` : "Resend"}
                  </button>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setWaStep("idle")} className="h-9 px-3 text-xs font-semibold text-sx-text-muted">Cancel</button>
                    <button type="button" onClick={() => void verifyWhatsappOtp()} disabled={waLoading || waOtp.length < 6} className="h-9 rounded-sx-sm bg-sx-accent px-4 text-xs font-bold text-sx-accent-on">
                      {waLoading ? "Verifying…" : "Verify"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-sx-text-subtle">Primary Channels</p>
            {PRIMARY_ROWS.map((row) => (
              <ConnectorRow key={row.key} row={row} />
            ))}

            <p className="mb-2 mt-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-sx-text-subtle">Social</p>
            {SOCIAL_ROWS.map((row) => (
              <ConnectorRow key={row.key} row={row} />
            ))}

            <p className="mb-2 mt-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-sx-text-subtle">Analytics</p>
            {ANALYTICS_ROWS.map((row) => (
              <ConnectorRow key={row.key} row={row} />
            ))}

            <button
              type="button"
              onClick={onClose}
              className="mt-3 h-[46px] w-full rounded-sx-md border-[1.5px] border-sx-border text-[15px] font-semibold text-sx-text-muted"
            >
              Skip for now
            </button>
          </>
        )}
      </div>
    </div>
  );
}
