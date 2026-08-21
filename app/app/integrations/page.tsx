"use client";

import { useEffect, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/Feedback";
import { PlatformIcon, type PlatformIconKey } from "@/components/audit/PlatformIcon";
import { GoogleSearchIntegrationPanel } from "../components/GoogleSearchIntegrationPanel";

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
  youtube: ConnectorState;
  google: ConnectorState;
  google_analytics?: ConnectorState;
  google_search_console?: ConnectorState;
  threads?: ConnectorState;
  linkedin?: ConnectorState;
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

/** Dot + label matching the Connected Accounts reference's visual language (green/Active, amber/Needs attention, gray/Not connected — exact wording kept from the tested product copy) — status is never colour alone, the label always says it too. */
function ConnectionBadge({
  state,
  canConnect,
  isDiscovered,
}: {
  state: ConnectorState;
  canConnect: boolean;
  isDiscovered: boolean;
}) {
  if (state === "checking") {
    return <span className="shrink-0 rounded-lg bg-sx-surface-2 px-2.5 py-1 text-[11px] font-semibold text-sx-text-subtle">Checking</span>;
  }
  if (state === "connected") {
    return (
      <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-sx-success/10 px-2.5 py-1">
        <span className="h-[5px] w-[5px] rounded-full bg-sx-success" />
        <span className="text-[11px] font-semibold text-sx-success">Active</span>
      </span>
    );
  }
  if (state === "action_required") {
    return (
      <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-sx-warning/10 px-2.5 py-1">
        <span className="h-[5px] w-[5px] rounded-full bg-sx-warning" />
        <span className="text-[11px] font-semibold text-sx-warning">Needs attention</span>
      </span>
    );
  }
  if (isDiscovered) {
    return <span className="shrink-0 rounded-lg bg-sx-accent-muted px-2.5 py-1 text-[11px] font-semibold text-sx-accent">Found publicly</span>;
  }
  if (!canConnect) {
    return <span className="shrink-0 rounded-lg bg-sx-surface-2 px-2.5 py-1 text-[11px] font-semibold text-sx-text-subtle">Testing access required</span>;
  }
  return <span className="shrink-0 rounded-lg bg-sx-surface-2 px-2.5 py-1 text-[11px] font-semibold text-sx-text-subtle">Not connected</span>;
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

  async function handleDisconnect(provider: string) {
    if (!tenantId) return;
    const confirmed = window.confirm(`Are you sure you want to disconnect ${provider.replace("_", " ")}?`);
    if (!confirmed) return;

    try {
      const res = await fetch("/api/platform/integrations/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, provider }),
      });
      if (res.ok) {
        setWhatsappSuccessMsg(`✓ ${provider.replace("_", " ")} disconnected successfully.`);
        reloadStatus();
        setTimeout(() => setWhatsappSuccessMsg(null), 4000);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not disconnect account.");
      }
    } catch {
      setError("Network error disconnecting account.");
    }
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
    /** Reference groups connectors into "Primary Channels" vs "Analytics & Other". */
    tier: "primary" | "analytics";
  }> = [
    {
      key: "google_business",
      title: "Google Business",
      state: status?.google ?? "setup_required",
      copy: "Helps customers find your shop on Google Maps & Search.",
      isOAuth: true,
      tier: "primary",
    },
    {
      key: "whatsapp",
      // Deliberately not the reference's literal connector name — this
      // verifies the phone number for OTP-based notifications only, not a
      // full messaging-platform API integration (v1-customer-boundaries.test.ts /
      // p0-product-boundaries.test.ts guard this distinction explicitly).
      title: "WhatsApp Number",
      state: status?.whatsapp ?? "setup_required",
      copy: status?.whatsapp === "connected"
        ? "Phone number verified for instant lead notifications and audit alerts."
        : "Verify the phone number you use for WhatsApp to receive instant customer enquiries & auto-replies.",
      isOAuth: false,
      tier: "primary",
    },
    {
      key: "instagram",
      title: "Instagram",
      state: status?.instagram ?? "checking",
      copy: status?.instagram === "connected"
        ? "Connected — direct publishing, audience growth, and insights."
        : "Share offers & reach local customers with automated publishing.",
      isOAuth: true,
      tier: "primary",
    },
    {
      key: "facebook",
      title: "Facebook",
      state: status?.facebook ?? "checking",
      copy: status?.facebook === "connected"
        ? "Connected — Facebook Page management active."
        : "Page updates & local community reach.",
      isOAuth: true,
      tier: "primary",
    },
    {
      key: "youtube",
      title: "YouTube",
      state: status?.youtube ?? "checking",
      copy: status?.youtube === "connected"
        ? "Connected — video uploads and analytics active."
        : "Video publishing, shorts distribution, and performance tracking.",
      isOAuth: true,
      tier: "primary",
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

  const primaryCards = cards.filter((c) => c.tier === "primary");

  return (
    <div data-sx-ui="new-integrations" className="sx-customer-app mx-auto flex w-full max-w-[720px] flex-col gap-6 pb-20 md:pb-8">
      <div>
        <h1 className="text-2xl font-semibold text-sx-text">Connected Accounts{active ? ` · ${active.name}` : ""}</h1>
        <p className="sx-hi text-xs text-sx-text-subtle">जुड़े हुए खाते</p>
        <p className="mt-1 text-sm text-sx-text-muted">Real connection status. One-tap connect begins the real provider authorization.</p>
      </div>

      {whatsappSuccessMsg && (
        <div className="rounded-sx-sm border border-sx-success/30 bg-sx-success/10 px-4 py-3 text-sm font-medium text-sx-success flex items-center justify-between">
          <span>{whatsappSuccessMsg}</span>
          <button
            type="button"
            onClick={() => setWhatsappSuccessMsg(null)}
            className="text-sx-success hover:opacity-70"
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

      {/* Primary Channels — StratXcel App reference row-list */}
      <section>
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-sx-text-subtle">Primary Channels</p>
        <div className="flex flex-col gap-2.5">
          {primaryCards.map((card) => {
            const presence = presenceFor(card.key);
            const canConnect = card.isOAuth ? Boolean(status?.selfService?.social) : true;
            const isDiscovered = Boolean(presence?.href && card.state !== "connected");
            const connectHref = tenantId && card.isOAuth
              ? `/api/social/oauth/${card.key}/connect?redirectTo=${encodeURIComponent("/app/integrations")}&tenantId=${encodeURIComponent(tenantId)}`
              : null;

            return (
              <Card key={card.key} className="p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sx-sm bg-sx-accent-muted">
                    <PlatformIcon name={card.key} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-sx-text">{card.title}</p>
                    <p className="truncate text-xs text-sx-text-subtle">{card.copy}</p>
                  </div>
                  <ConnectionBadge state={card.state} canConnect={card.isOAuth ? canConnect : true} isDiscovered={isDiscovered} />
                </div>

                {presence?.href && (
                  <div className="mt-3 rounded-sx-sm bg-sx-surface-2 p-3">
                    <a
                      href={presence.href}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-sm font-semibold text-sx-accent hover:underline break-all"
                    >
                      {presence.handle || presence.href}
                    </a>
                    <p className="mt-1 text-xs text-sx-text-subtle">
                      {card.state === "connected"
                        ? "Authenticated account · direct publishing & analytics active"
                        : "Discovered via public web · Connect account to authenticate"}
                      {presence.lastSync ? ` · synced ${new Date(presence.lastSync).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                )}

                {card.isOAuth && tenantId && (
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-sx-border pt-3">
                    {card.state === "connected" && (
                      <div className="flex w-full items-center justify-between gap-2">
                        {connectHref ? (
                          <a href={connectHref}>
                            <Button variant="secondary" size="sm">Reconnect</Button>
                          </a>
                        ) : <span />}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-sx-danger hover:bg-sx-danger/10"
                          onClick={() => handleDisconnect(card.key)}
                        >
                          Disconnect
                        </Button>
                      </div>
                    )}

                    {card.state === "action_required" && connectHref && (
                      <a href={connectHref} className="w-full">
                        <Button variant="primary" size="sm" className="w-full">Reconnect account</Button>
                      </a>
                    )}

                    {card.state !== "connected" && card.state !== "action_required" && (
                      canConnect && connectHref ? (
                        <a href={connectHref} className="w-full">
                          <Button variant="primary" size="sm" className="w-full">Connect {card.title}</Button>
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
                  <div className="mt-3 border-t border-sx-border pt-3">
                    <Button
                      variant={card.state === "connected" ? "secondary" : "primary"}
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        setWhatsappModalOpen(true);
                        setOtpSent(false);
                        setWhatsappOtp("");
                        setOtpError(null);
                      }}
                    >
                      {card.state === "connected" ? "Update Number" : "Verify Number"}
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      {/* Analytics & Other — StratXcel App reference row-list */}
      {tenantId && (
        <section>
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-sx-text-subtle">Analytics & Other</p>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sx-sm bg-sx-accent-muted">
                <PlatformIcon name="analytics" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-sx-text">Search Console &amp; GA4</p>
                <p className="text-xs text-sx-text-subtle">Track rankings, visitors & behaviour via read-only Google OAuth.</p>
              </div>
            </div>
            <div className="mt-3 border-t border-sx-border pt-3">
              <GoogleSearchIntegrationPanel tenantId={tenantId} />
            </div>
          </Card>
        </section>
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
              <div className="rounded-sx-sm border border-sx-danger/30 bg-sx-danger/10 px-3 py-2 text-xs text-sx-danger">
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
                <div className="rounded-sx-sm bg-sx-success/10 border border-sx-success/20 p-2.5 text-xs text-sx-success">
                  <p className="font-semibold">WhatsApp code sent to {whatsappPhone}</p>
                  <p className="text-[11px] text-sx-success/80 mt-0.5">
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
