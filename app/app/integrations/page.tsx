"use client";

import { useEffect, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { Card, CardHeading } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { ErrorState } from "@/components/ui/Feedback";
import { PlatformIcon, type PlatformIconKey } from "@/components/audit/PlatformIcon";
import { GoogleSearchIntegrationPanel } from "../components/GoogleSearchIntegrationPanel";
import { ModulePageHeader } from "../components/ModulePageHeader";

export type ConnectorState =
  | "checking"
  | "connected"
  | "action_required"
  | "setup_required"
  | "discovered_public"
  | "testing_access_required";

interface CustomerIntegrationStatus {
  whatsapp: ConnectorState;
  facebook: ConnectorState;
  instagram: ConnectorState;
  threads: ConnectorState;
  youtube: ConnectorState;
  linkedin: ConnectorState;
  google: ConnectorState;
  presence?: Array<{
    key: PlatformIconKey;
    label: string;
    handle: string | null;
    href: string | null;
    provenance: string;
    lastSync: string | null;
  }>;
  selfService?: { google?: boolean; social?: boolean; whatsapp?: boolean };
}

function BusinessStatus({
  state,
  canConnect,
  isDiscovered,
}: {
  state: ConnectorState;
  canConnect: boolean;
  isDiscovered: boolean;
}) {
  if (state === "checking") return <StatusChip state="neutral">Checking</StatusChip>;
  if (state === "connected") return <StatusChip state="success">Connected</StatusChip>;
  if (state === "action_required") return <StatusChip state="warning">Needs attention</StatusChip>;
  if (isDiscovered) return <StatusChip state="accent">Found publicly</StatusChip>;
  if (!canConnect) return <StatusChip state="neutral">Testing access required</StatusChip>;
  return <StatusChip state="neutral">Not connected</StatusChip>;
}

export default function IntegrationsPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;
  const [status, setStatus] = useState<CustomerIntegrationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Request Access Dialog State
  const [requestModalProvider, setRequestModalProvider] = useState<{ key: string; title: string } | null>(null);
  const [requestReason, setRequestReason] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestFeedback, setRequestFeedback] = useState<string | null>(null);

  // WhatsApp Verification Modal State
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [whatsappOtp, setWhatsappOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [whatsappSuccessMsg, setWhatsappSuccessMsg] = useState<string | null>(null);

  // Countdown timer for OTP resend cooldown
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  function reloadStatus() {
    if (!tenantId) return;
    fetch(`/api/platform/integrations/status?tenantId=${encodeURIComponent(tenantId)}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) {
          setError(body.error ?? "Could not load connection status.");
          return;
        }
        setError(null);
        setStatus(body as CustomerIntegrationStatus);
      })
      .catch(() => setError("Could not load connection status."));
  }

  useEffect(() => {
    if (!tenantId) return;
    reloadStatus();
  }, [tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const presenceFor = (key: PlatformIconKey) => status?.presence?.find((entry) => entry.key === key);

  const cards: Array<{
    key: PlatformIconKey;
    title: string;
    state: ConnectorState;
    copy: string;
    isOAuth: boolean;
  }> = [
    {
      key: "google_business",
      title: "Google Business",
      state: status?.google ?? "setup_required",
      copy: "Connect your Google Business Profile to boost local ranking, sync reviews, and manage business details.",
      isOAuth: true,
    },
    {
      key: "instagram",
      title: "Instagram",
      state: status?.instagram ?? "checking",
      copy: status?.instagram === "connected"
        ? "Connected to Meta for direct publishing, audience growth, and insights."
        : "Connect your Instagram Business account to automate publishing, creative stories, and track insights.",
      isOAuth: true,
    },
    {
      key: "facebook",
      title: "Facebook",
      state: status?.facebook ?? "checking",
      copy: status?.facebook === "connected"
        ? "Connected to Meta for Facebook Page management."
        : "Connect your Facebook Business Page for automated content distribution and community engagement.",
      isOAuth: true,
    },
    {
      key: "youtube",
      title: "YouTube",
      state: status?.youtube ?? "checking",
      copy: status?.youtube === "connected"
        ? "Connected to YouTube for video uploads and analytics."
        : "Connect your YouTube channel for video publishing, shorts distribution, and performance tracking.",
      isOAuth: true,
    },
    {
      key: "whatsapp",
      title: "WhatsApp Number",
      state: status?.whatsapp ?? "setup_required",
      copy: status?.whatsapp === "connected"
        ? "Phone number verified for instant lead notifications and audit alerts."
        : "Verify the phone number you use for WhatsApp to receive instant updates and audit alerts.",
      isOAuth: false,
    },
  ];

  async function handleSendWhatsappOtp() {
    setOtpError(null);
    setOtpLoading(true);
    try {
      const res = await fetch("/api/platform/onboarding/whatsapp/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: whatsappPhone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.error || "Failed to send OTP. Please check the phone number.");
        return;
      }
      setOtpSent(true);
      setCooldownSeconds(data.cooldownSeconds || 60);
    } catch {
      setOtpError("Network error sending OTP. Please try again.");
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleVerifyWhatsappOtp() {
    setOtpError(null);
    setOtpLoading(true);
    try {
      const res = await fetch("/api/platform/onboarding/whatsapp/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: whatsappPhone, otp: whatsappOtp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.error || "Invalid OTP code. Please retry.");
        return;
      }
      const verified = data.verifiedNumber || whatsappPhone;
      setWhatsappModalOpen(false);
      setOtpSent(false);
      setWhatsappOtp("");
      setWhatsappSuccessMsg(`✓ WhatsApp number ${verified} verified successfully!`);
      reloadStatus();
      setTimeout(() => setWhatsappSuccessMsg(null), 5000);
    } catch {
      setOtpError("Network error verifying OTP. Please try again.");
    } finally {
      setOtpLoading(false);
    }
  }

  async function submitAccessRequest() {
    if (!requestModalProvider || !tenantId) return;
    setRequestSubmitting(true);
    try {
      const res = await fetch("/api/platform/integrations/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          provider: requestModalProvider.key,
          reason: requestReason,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRequestFeedback(data.message ?? "Request received. We’ll notify you when testing access is enabled.");
        setTimeout(() => {
          setRequestModalProvider(null);
          setRequestFeedback(null);
          setRequestReason("");
        }, 2500);
      } else {
        setRequestFeedback(data.error ?? "Could not submit request.");
      }
    } catch {
      setRequestFeedback("Could not submit request. Please try again.");
    } finally {
      setRequestSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ModulePageHeader
        title="Connectors"
        tenantName={active?.name}
        description="Real connection status and verified business destinations. One-tap connect begins the real provider authorization."
      />

      {whatsappSuccessMsg && (
        <div className="rounded-sx-sm border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-300 flex items-center justify-between">
          <span>{whatsappSuccessMsg}</span>
          <button
            type="button"
            onClick={() => setWhatsappSuccessMsg(null)}
            className="text-emerald-400 hover:text-emerald-200"
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <ErrorState
          message={error}
          onRetry={reloadStatus}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map((card) => {
          const presence = presenceFor(card.key);
          const canConnect = card.isOAuth ? Boolean(status?.selfService?.social) : true;
          const isDiscovered = Boolean(presence?.href && card.state !== "connected");
          const connectHref = tenantId && card.isOAuth
            ? `/api/social/oauth/${card.key}/connect?redirectTo=${encodeURIComponent("/app/integrations")}&tenantId=${encodeURIComponent(tenantId)}`
            : null;

          return (
            <Card key={card.key} className="flex flex-col justify-between p-5">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <CardHeading>
                    <span className="inline-flex items-center gap-2">
                      <PlatformIcon name={card.key} /> {card.title}
                    </span>
                  </CardHeading>
                  <BusinessStatus
                    state={card.state}
                    canConnect={card.isOAuth ? canConnect : true}
                    isDiscovered={isDiscovered}
                  />
                </div>
                <p className="mt-2 text-sm text-sx-text-muted">{card.copy}</p>

                {presence?.href && (
                  <div className="mt-3 rounded-sx-sm bg-sx-surface-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <a
                        href={presence.href}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-sm font-semibold text-sx-accent hover:underline break-all"
                      >
                        {presence.handle || presence.href}
                      </a>
                    </div>
                    <p className="mt-1 text-xs text-sx-text-subtle">
                      {presence.provenance.replaceAll("_", " ")}
                      {presence.lastSync ? ` · synced ${new Date(presence.lastSync).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                )}
              </div>

              {card.isOAuth && tenantId && (
                <div className="mt-5 pt-3 border-t border-sx-border/40 flex items-center justify-between gap-3">
                  {card.state === "connected" && connectHref && (
                    <a href={connectHref}>
                      <Button variant="secondary" size="sm">
                        Reconnect
                      </Button>
                    </a>
                  )}

                  {card.state === "action_required" && connectHref && (
                    <a href={connectHref}>
                      <Button variant="primary" size="sm">
                        Reconnect account
                      </Button>
                    </a>
                  )}

                  {card.state !== "connected" && card.state !== "action_required" && (
                    canConnect && connectHref ? (
                      <a href={connectHref}>
                        <Button variant="primary" size="sm">
                          Connect {card.title}
                        </Button>
                      </a>
                    ) : (
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="text-xs text-sx-text-subtle">Testing access required</span>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setRequestModalProvider({ key: card.key, title: card.title });
                            setRequestReason("");
                            setRequestFeedback(null);
                          }}
                        >
                          Request access
                        </Button>
                      </div>
                    )
                  )}
                </div>
              )}

              {!card.isOAuth && card.key === "whatsapp" && (
                <div className="mt-5 pt-3 border-t border-sx-border/40 flex items-center justify-between gap-3">
                  {card.state === "connected" ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setWhatsappModalOpen(true);
                        setOtpSent(false);
                        setWhatsappOtp("");
                        setOtpError(null);
                      }}
                    >
                      Update Number
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setWhatsappModalOpen(true);
                        setOtpSent(false);
                        setWhatsappOtp("");
                        setOtpError(null);
                      }}
                    >
                      Verify Number
                    </Button>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {tenantId && (
        <Card className="p-5">
          <CardHeading>
            <span className="inline-flex items-center gap-2">
              <PlatformIcon name="google" />
              <PlatformIcon name="analytics" />
              Search Console &amp; GA4
            </span>
          </CardHeading>
          <p className="mb-4 mt-2 text-sm text-sx-text-muted">
            Connect Google Search Console and GA4 properties for this workspace via read-only Google OAuth.
          </p>
          <GoogleSearchIntegrationPanel tenantId={tenantId} />
        </Card>
      )}

      {/* WhatsApp OTP Modal */}
      {whatsappModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="whatsapp-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-sx-lg border border-sx-border bg-sx-surface-1 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <PlatformIcon name="whatsapp" className="h-5 w-5" />
                <h4 id="whatsapp-dialog-title" className="font-sx-sans text-base font-bold text-sx-text">
                  Verify WhatsApp Number
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setWhatsappModalOpen(false)}
                className="text-sx-text-muted hover:text-sx-text text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-sx-text-muted">
              We&rsquo;ll send a 6-digit verification code directly to your WhatsApp to verify your account.
            </p>

            {otpError && (
              <div className="rounded-sx-sm border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                {otpError}
              </div>
            )}

            {!otpSent ? (
              <div className="space-y-4">
                <div>
                  <label htmlFor="integrations-whatsapp-phone" className="block text-xs font-medium text-sx-text mb-1">
                    WhatsApp Phone Number
                  </label>
                  <input
                    id="integrations-whatsapp-phone"
                    value={whatsappPhone}
                    onChange={(e) => setWhatsappPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    autoFocus
                    className="w-full rounded-sx-sm border border-sx-border bg-sx-surface-2 p-2.5 text-sm font-mono text-sx-text placeholder:text-sx-text-subtle focus:border-sx-accent focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setWhatsappModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleSendWhatsappOtp}
                    disabled={otpLoading || !whatsappPhone.trim()}
                  >
                    {otpLoading ? "Sending OTP…" : "Send OTP on WhatsApp"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-sx-sm bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-xs text-emerald-300">
                  <p className="font-semibold">WhatsApp code sent to {whatsappPhone}</p>
                  <p className="text-[11px] text-emerald-400/80 mt-0.5">
                    Tap <strong>Copy Code</strong> in your WhatsApp message, then paste the 6-digit code below.
                  </p>
                </div>

                <div>
                  <label htmlFor="integrations-whatsapp-otp" className="block text-xs font-medium text-sx-text mb-1">
                    Enter 6-Digit Code
                  </label>
                  <input
                    id="integrations-whatsapp-otp"
                    value={whatsappOtp}
                    onChange={(e) => setWhatsappOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    autoFocus
                    maxLength={6}
                    className="w-full rounded-sx-sm border border-sx-border bg-sx-surface-2 p-3 text-center text-lg font-mono font-bold tracking-widest text-sx-text placeholder:text-sx-text-subtle focus:border-sx-accent focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={handleSendWhatsappOtp}
                    disabled={cooldownSeconds > 0 || otpLoading}
                    className="text-sx-accent hover:underline disabled:opacity-50 disabled:no-underline"
                  >
                    {cooldownSeconds > 0 ? `Resend code in ${cooldownSeconds}s` : "Resend code"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOtpSent(false);
                      setWhatsappOtp("");
                      setOtpError(null);
                    }}
                    className="text-sx-text-subtle hover:text-sx-text-muted"
                  >
                    Change Number
                  </button>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setWhatsappModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleVerifyWhatsappOtp}
                    disabled={otpLoading || whatsappOtp.length < 6}
                  >
                    {otpLoading ? "Verifying…" : "Verify & Connect"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Request Access Dialog */}
      {requestModalProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-sx-md bg-sx-surface-1 p-6 shadow-xl border border-sx-border">
            <h3 className="text-lg font-semibold text-sx-text">Request Connector Access</h3>
            <p className="mt-1 text-sm text-sx-text-muted">
              Connector testing for <strong className="text-sx-text">{requestModalProvider.title}</strong> is currently limited to approved test accounts.
            </p>

            {requestFeedback ? (
              <div className="my-4 rounded-sx-sm bg-sx-surface-2 p-3 text-sm text-sx-accent font-medium">
                {requestFeedback}
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                <label className="text-xs text-sx-text-subtle">
                  Workspace context: <span className="font-semibold text-sx-text">{active?.name ?? tenantId}</span>
                </label>
                <textarea
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  placeholder="Optional: Tell us what you plan to connect or test..."
                  rows={3}
                  className="w-full rounded-sx-sm border border-sx-border bg-sx-surface-2 p-2.5 text-sm text-sx-text placeholder:text-sx-text-subtle focus:border-sx-accent focus:outline-none"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setRequestModalProvider(null)}
                    disabled={requestSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={submitAccessRequest}
                    disabled={requestSubmitting}
                  >
                    {requestSubmitting ? "Submitting…" : "Submit Request"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
