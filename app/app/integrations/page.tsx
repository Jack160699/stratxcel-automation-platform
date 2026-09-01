"use client";

import { useEffect, useState, useRef } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/Feedback";
import { PlatformIcon, type PlatformIconKey } from "@/components/audit/PlatformIcon";
import { GoogleSearchIntegrationPanel } from "../components/GoogleSearchIntegrationPanel";
import { WebsiteConnectorCard } from "../components/WebsiteConnectorCard";
import type { ConnectorState, CustomerIntegrationStatus } from "@/lib/connectors/load-integrations-data";

function ConnectionBadge({
  state,
  canConnect,
  isDiscovered,
  isLocationSetupRequired,
  isVerificationRequired,
  isVerificationPending,
}: {
  state: ConnectorState;
  canConnect: boolean;
  isDiscovered: boolean;
  isLocationSetupRequired?: boolean;
  isVerificationRequired?: boolean;
  isVerificationPending?: boolean;
}) {
  if (state === "checking") {
    return <span className="shrink-0 rounded-lg bg-sx-surface-2 px-2.5 py-1 text-[11px] font-semibold text-sx-text-subtle">Checking</span>;
  }
  if (state === "connected") {
    // Location setup takes precedence -- verification isn't even a
    // knowable question yet without a resolved location.
    if (isLocationSetupRequired) {
      return (
        <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-sx-warning/10 px-2.5 py-1">
          <span className="h-[5px] w-[5px] rounded-full bg-sx-warning" />
          <span className="text-[11px] font-semibold text-sx-warning">Location setup required</span>
        </span>
      );
    }
    if (isVerificationRequired) {
      return (
        <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-sx-warning/10 px-2.5 py-1">
          <span className="h-[5px] w-[5px] rounded-full bg-sx-warning" />
          <span className="text-[11px] font-semibold text-sx-warning">Verification required</span>
        </span>
      );
    }
    if (isVerificationPending) {
      return (
        <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-sx-accent-muted px-2.5 py-1">
          <span className="h-[5px] w-[5px] rounded-full bg-sx-accent" />
          <span className="text-[11px] font-semibold text-sx-accent">Pending Google review</span>
        </span>
      );
    }
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

  const [googleIntroOpen, setGoogleIntroOpen] = useState(false);
  const [requestModalProvider, setRequestModalProvider] = useState<{ key: string; title: string } | null>(null);
  const [requestReason, setRequestReason] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestFeedback, setRequestFeedback] = useState<string | null>(null);

  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [whatsappOtp, setWhatsappOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [whatsappSuccessMsg, setWhatsappSuccessMsg] = useState<string | null>(null);
  const [whatsappIsFirstConnect, setWhatsappIsFirstConnect] = useState(true);
  const [whatsappJustVerified, setWhatsappJustVerified] = useState<string | null>(null);
  const [oauthBanner, setOauthBanner] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  // Surface the result of a real OAuth reconnect/connect attempt. The
  // callback route redirects back here with ?oauth=success|error|denied|
  // cancelled&provider=...&connect_error=<internal_code> — until this ran,
  // that result was silently dropped: a customer who clicked "Reconnect
  // account", completed Google's consent screen, and hit a real backend
  // failure just landed back on this page with zero indication anything had
  // gone wrong, looking identical to never having clicked it at all.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get("oauth");
    if (!oauthStatus) return;

    const providerLabel = (params.get("provider") || params.get("connected") || "account").replace(/_/g, " ");
    const connectError = params.get("connect_error");

    if (oauthStatus === "success") {
      setOauthBanner({ kind: "success", message: `✓ ${providerLabel} connected successfully.` });
      reloadStatus();
    } else if (oauthStatus === "denied" || oauthStatus === "cancelled") {
      setOauthBanner({
        kind: "error",
        message: `You didn't finish granting access to ${providerLabel}, so nothing was connected. You can try again anytime.`,
      });
    } else {
      const friendly =
        connectError === "state_expired" || connectError === "state_already_used" || connectError === "state_not_found"
          ? `That connection link for ${providerLabel} expired before it finished. Please try connecting again.`
          : connectError === "missing_tenant"
          ? `We couldn't confirm your workspace for this connection. Please refresh the page and try again.`
          : `We couldn't finish connecting ${providerLabel}. Please try again — if it keeps happening, contact support.`;
      setOauthBanner({ kind: "error", message: friendly });
      // eslint-disable-next-line no-console
      console.error("OAuth connect failed", { provider: params.get("provider"), connect_error: connectError });
    }

    // Strip the query params so a refresh doesn't re-show the banner.
    const url = new URL(window.location.href);
    ["oauth", "provider", "connected", "connect_error"].forEach((k) => url.searchParams.delete(k));
    window.history.replaceState({}, "", url.pathname + url.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const initialTenantRef = useRef(tenantId);
  useEffect(() => {
    if (tenantId) {
      initialTenantRef.current = tenantId;
      reloadStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // Auto-probe Google Business location if account is connected but location is unresolved
  const probedGbpRef = useRef(false);
  useEffect(() => {
    if (!tenantId || !status || probedGbpRef.current) return;
    if (status.google === "connected" && status.google_business_details?.locationSetupRequired) {
      probedGbpRef.current = true;
      fetch("/api/platform/social/google-business/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      })
        .then((r) => r.json())
        .then((res) => {
          if (res.ok && res.locationResolved) {
            reloadStatus();
          }
        })
        .catch(() => {});
    }
  }, [tenantId, status]);

  const presenceFor = (key: PlatformIconKey) => status?.presence?.find((entry) => entry.key === key);

  const cards: Array<{
    key: PlatformIconKey;
    title: string;
    state: ConnectorState;
    copy: string;
    isOAuth: boolean;
    tier: "primary" | "analytics";
  }> = [
    {
      key: "google_business",
      title: "Google Business",
      state: status?.google ?? "setup_required",
      copy: status?.google_business_details?.locationResolved && status?.google_business_details?.verificationRequired
        ? "Business location found — Google verification required to activate."
        : status?.google_business_details?.locationResolved && status?.google_business_details?.verificationPending
        ? "Business location found — Google is reviewing your verification."
        : status?.google_business_details?.locationResolved
        ? "Connected — Google Maps & Search profile active."
        : status?.google === "connected" && status?.google_business_details?.locationSetupRequired
        ? "Google account connected · Business location setup required."
        : "Helps customers find your shop on Google Maps & Search.",
      isOAuth: true,
      tier: "primary",
    },
    {
      key: "whatsapp",
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
      setWhatsappJustVerified(verified);
      reloadStatus();
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
    <div className="sx-customer-app mx-auto flex w-full max-w-[720px] flex-col gap-6 pb-20 md:pb-8">
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

      {oauthBanner && (
        <div
          className={
            oauthBanner.kind === "success"
              ? "rounded-sx-sm border border-sx-success/30 bg-sx-success/10 px-4 py-3 text-sm font-medium text-sx-success flex items-center justify-between"
              : "rounded-sx-sm border border-sx-warning/30 bg-sx-warning/10 px-4 py-3 text-sm font-medium text-sx-warning flex items-center justify-between"
          }
        >
          <span>{oauthBanner.message}</span>
          <button
            type="button"
            onClick={() => setOauthBanner(null)}
            className="hover:opacity-70"
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

      {/* Website */}
      {tenantId && (
        <section>
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-sx-text-subtle">Website</p>
          <WebsiteConnectorCard tenantId={tenantId} />
        </section>
      )}

      {/* Primary Channels */}
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

            const isGbp = card.key === "google_business";
            const gbpDetails = status?.google_business_details;
            const isLocationSetupRequired = isGbp && Boolean(gbpDetails?.locationSetupRequired);
            const isLocationResolved = isGbp && Boolean(gbpDetails?.locationResolved);
            const isVerificationRequired = isGbp && isLocationResolved && Boolean(gbpDetails?.verificationRequired);
            const isVerificationPending = isGbp && isLocationResolved && Boolean(gbpDetails?.verificationPending);

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
                  <ConnectionBadge
                    state={!status && card.state !== "connected" ? "checking" : card.state}
                    canConnect={card.isOAuth ? canConnect : true}
                    isDiscovered={isDiscovered}
                    isLocationSetupRequired={isLocationSetupRequired}
                    isVerificationRequired={isVerificationRequired}
                    isVerificationPending={isVerificationPending}
                  />
                </div>

                {/* Google Business Profile location resolved */}
                {isGbp && card.state === "connected" && isLocationResolved && (
                  <div className="mt-3 rounded-sx-sm bg-sx-surface-2 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-sx-text">
                        {gbpDetails?.businessTitle || "StratXcel"}
                      </p>
                      {gbpDetails?.permission && (
                        <span className="rounded bg-sx-accent-muted px-2 py-0.5 text-[10px] font-semibold text-sx-accent">
                          {gbpDetails.permission.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                    {gbpDetails?.address && (
                      <p className="mt-1 text-xs text-sx-text-muted">
                        {gbpDetails.address}
                      </p>
                    )}
                    {gbpDetails?.category && (
                      <p className="mt-0.5 text-[11px] text-sx-text-subtle">
                        Category: {gbpDetails.category}
                      </p>
                    )}
                    {gbpDetails?.mapsUrl && (
                      <a
                        href={gbpDetails.mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block text-xs font-medium text-sx-accent hover:underline"
                      >
                        View on Google Maps ↗
                      </a>
                    )}
                    {/* A resolved location is not automatically a verified
                        one -- claiming "Reviews & local search active" here
                        regardless would be exactly the OAuth-success-as-
                        verification-success conflation the brief forbids. */}
                    {isVerificationRequired || isVerificationPending ? (
                      <p className="mt-1 text-xs font-medium text-sx-warning">
                        {gbpDetails?.verificationMessage}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-sx-text-subtle">
                        Authenticated Google Business Profile · Reviews & local search active
                      </p>
                    )}
                    {isVerificationRequired && (
                      <a
                        href="https://business.google.com/locations"
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex"
                      >
                        <Button variant="primary" size="sm">Complete verification ↗</Button>
                      </a>
                    )}
                  </div>
                )}

                {/* Google Business Profile authenticated but location setup required */}
                {isGbp && card.state === "connected" && isLocationSetupRequired && (
                  <div className="mt-3 rounded-sx-sm border border-sx-warning/30 bg-sx-warning/5 p-3">
                    <p className="text-xs font-semibold text-sx-warning">
                      ✓ Google Account Connected {gbpDetails?.googleEmail ? `(${gbpDetails.googleEmail})` : ""}
                    </p>
                    <p className="mt-1 text-xs text-sx-text-subtle">
                      We couldn&apos;t find a matching Business Profile location for this account. Create or verify your business in Google Business Profile.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <a
                        href="https://business.google.com/"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex"
                      >
                        <Button variant="primary" size="sm">
                          Complete Google Business setup ↗
                        </Button>
                      </a>
                      {connectHref && (
                        <a href={connectHref} className="inline-flex">
                          <Button variant="secondary" size="sm">
                            Reconnect with another account
                          </Button>
                        </a>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-sx-danger hover:bg-sx-danger/10"
                        onClick={() => handleDisconnect(card.key)}
                      >
                        Disconnect
                      </Button>
                    </div>
                  </div>
                )}

                {/* Other providers presence */}
                {!isGbp && presence?.href && (
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

                {card.isOAuth && tenantId && !(isGbp && card.state === "connected" && isLocationSetupRequired) && (
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
                      !status ? (
                        // Status hasn't loaded yet -- found live during E2E
                        // testing: canConnect defaulted to
                        // Boolean(status?.selfService?.social) which is
                        // Boolean(undefined) === false before this first
                        // fetch resolves, so every OAuth connector flashed
                        // "Testing access required" + "Request access" on
                        // every page load for every eligible tenant owner,
                        // even though the real eligibility check (a moment
                        // later) says they can connect fine. Show a neutral
                        // loading state instead of a false ineligibility claim.
                        <span className="text-xs text-sx-text-subtle">Checking access…</span>
                      ) : canConnect && connectHref ? (
                        card.key === "google_business" ? (
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            className="w-full"
                            onClick={() => setGoogleIntroOpen(true)}
                          >
                            Connect {card.title}
                          </Button>
                        ) : (
                          <a href={connectHref} className="w-full">
                            <Button variant="primary" size="sm" className="w-full">Connect {card.title}</Button>
                          </a>
                        )
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
                        setWhatsappIsFirstConnect(card.state !== "connected");
                        setWhatsappJustVerified(null);
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

      {/* Analytics & Other */}
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

      {/* Connect WhatsApp */}
      {whatsappModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="whatsapp-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-sx-lg border border-sx-border bg-sx-surface-1 p-6 shadow-2xl">
            <div className="flex gap-1.5">
              <span className="h-[3px] flex-1 rounded-full bg-sx-success" />
              <span className={`h-[3px] flex-1 rounded-full transition-colors ${otpSent || whatsappJustVerified ? "bg-sx-success" : "bg-sx-border"}`} />
              <span className={`h-[3px] flex-1 rounded-full transition-colors ${whatsappJustVerified ? "bg-sx-success" : "bg-sx-border"}`} />
            </div>

            {!whatsappJustVerified && (
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <PlatformIcon name="whatsapp" className="h-5 w-5" />
                  <h4 id="whatsapp-dialog-title" className="font-sx-sans text-base font-bold text-sx-text">
                    {otpSent ? "Enter OTP" : "Connect Your WhatsApp Number"}
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
            )}

            {otpError && (
              <div className="mt-3 rounded-sx-sm border border-sx-danger/30 bg-sx-danger/10 px-3 py-2 text-xs text-sx-danger">
                {otpError}
              </div>
            )}

            {whatsappJustVerified ? (
              <div className="mt-6 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sx-success/10">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--sx-success)" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
                </div>
                <p className="mt-4 text-lg font-bold text-sx-text">WhatsApp Connected!</p>
                <p className="mt-1.5 text-sm leading-relaxed text-sx-text-muted">
                  {whatsappJustVerified} is verified. You&rsquo;ll get instant lead notifications and audit alerts here.
                </p>
                <Button
                  type="button"
                  variant="primary"
                  className="mt-5 w-full"
                  onClick={() => {
                    setWhatsappModalOpen(false);
                    setOtpSent(false);
                    setWhatsappOtp("");
                    setWhatsappSuccessMsg(`✓ WhatsApp number ${whatsappJustVerified} verified successfully!`);
                    setWhatsappJustVerified(null);
                    setTimeout(() => setWhatsappSuccessMsg(null), 5000);
                  }}
                >
                  Done
                </Button>
              </div>
            ) : !otpSent ? (
              <div className="mt-4 space-y-4">
                {whatsappIsFirstConnect && (
                  <div className="rounded-sx-md bg-sx-surface-2 p-3.5">
                    <div className="flex flex-col gap-2">
                      {["Instant customer enquiries & auto-replies", "Audit alerts delivered to your phone", "After-hours auto-reply support"].map((benefit) => (
                        <div key={benefit} className="flex items-center gap-2">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--sx-success)" strokeWidth="2" className="shrink-0"><path d="M20 6L9 17l-5-5" /></svg>
                          <span className="text-[13px] text-sx-text">{benefit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
                  <Button type="button" variant="ghost" size="sm" onClick={() => setWhatsappModalOpen(false)}>
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
              <div className="mt-4 space-y-4">
                <p className="text-center text-xs text-sx-text-muted">
                  We sent a 6-digit code to {whatsappPhone}. Tap <strong>Copy Code</strong> in WhatsApp, then paste or type it below.
                </p>

                <label htmlFor="integrations-whatsapp-otp" className="sr-only">Enter 6-Digit Code</label>
                <div className="relative">
                  <input
                    id="integrations-whatsapp-otp"
                    value={whatsappOtp}
                    onChange={(e) => setWhatsappOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    autoFocus
                    inputMode="numeric"
                    maxLength={6}
                    className="absolute inset-0 h-[52px] w-full cursor-text opacity-0"
                  />
                  <div className="flex justify-center gap-2.5" aria-hidden="true">
                    {Array.from({ length: 6 }, (_, i) => whatsappOtp[i] ?? "").map((digit, i) => (
                      <span
                        key={i}
                        className={`flex h-[52px] w-11 items-center justify-center rounded-sx-sm text-[22px] font-bold text-sx-text ${
                          digit ? "border-2 border-sx-accent bg-sx-surface-2" : "border border-sx-border bg-sx-surface-2 text-sx-text-subtle"
                        }`}
                      >
                        {digit || "_"}
                      </span>
                    ))}
                  </div>
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
                  <Button type="button" variant="ghost" size="sm" onClick={() => setWhatsappModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleVerifyWhatsappOtp}
                    disabled={otpLoading || whatsappOtp.length < 6}
                  >
                    {otpLoading ? "Verifying…" : "Verify"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Connect Google Business */}
      {googleIntroOpen && tenantId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="google-intro-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-sx-lg border border-sx-border bg-sx-surface-1 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <PlatformIcon name="google_business" className="h-5 w-5" />
                <h4 id="google-intro-dialog-title" className="font-sx-sans text-base font-bold text-sx-text">
                  Connect Google Business
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setGoogleIntroOpen(false)}
                className="text-sx-text-muted hover:text-sx-text text-sm"
              >
                ✕
              </button>
            </div>

            <p className="mt-3 text-sm text-sx-text-muted">
              You&rsquo;ll sign in with Google and grant StratXcel access to your Business Profile. We only request the permissions needed for these:
            </p>

            <div className="mt-3 rounded-sx-md bg-sx-surface-2 p-3.5">
              <div className="flex flex-col gap-2">
                {["Appear on Google Maps & Search", "Sync your reviews and ratings", "Keep your business info accurate"].map((benefit) => (
                  <div key={benefit} className="flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--sx-success)" strokeWidth="2" className="shrink-0"><path d="M20 6L9 17l-5-5" /></svg>
                    <span className="text-[13px] text-sx-text">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <Button type="button" variant="ghost" size="sm" onClick={() => setGoogleIntroOpen(false)}>
                Cancel
              </Button>
              <a
                href={`/api/social/oauth/google_business/connect?redirectTo=${encodeURIComponent("/app/integrations")}&tenantId=${encodeURIComponent(tenantId)}`}
              >
                <Button type="button" variant="primary" size="sm">
                  Sign in with Google
                </Button>
              </a>
            </div>
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
