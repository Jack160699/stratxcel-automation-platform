"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FormField } from "../FormField";
import { PlatformIcon } from "@/components/audit/PlatformIcon";
import type { SocialConnection, SocialPlatformKey } from "../types";

/** Provider label used for OAuth attribution in UI. */
const PROVIDER_LABELS: Partial<Record<SocialPlatformKey, string>> = {
  google_business: "Google",
  instagram: "Meta",
  facebook: "Meta",
  youtube: "Google",
  threads: "Meta",
  linkedin: "LinkedIn",
  x: "X",
  whatsapp: "WhatsApp Verified",
};

interface PlatformCardConfig {
  key: SocialPlatformKey;
  label: string;
  description: string;
  oauthAvailable: boolean;
  ctaText?: string;
  publicProfilePlaceholder?: string;
}

/** Mandatory order: Google Business -> Instagram -> Facebook -> YouTube -> Threads -> LinkedIn -> X -> WhatsApp Number */
const PLATFORM_CARDS: PlatformCardConfig[] = [
  {
    key: "google_business",
    label: "Google Business",
    description: "Connect your Google Business Profile to boost local ranking, sync reviews, and manage business details.",
    oauthAvailable: true,
    ctaText: "Connect",
  },
  {
    key: "instagram",
    label: "Instagram",
    description: "Connect your Instagram Business account to automate publishing, creative stories, and track insights.",
    oauthAvailable: true,
    ctaText: "Connect",
    publicProfilePlaceholder: "@yourbrand",
  },
  {
    key: "facebook",
    label: "Facebook",
    description: "Connect your Facebook Page for automated content distribution and community engagement.",
    oauthAvailable: true,
    ctaText: "Connect",
    publicProfilePlaceholder: "Page name or URL",
  },
  {
    key: "youtube",
    label: "YouTube",
    description: "Connect your YouTube channel for video publishing, shorts distribution, and performance tracking.",
    oauthAvailable: true,
    ctaText: "Connect",
    publicProfilePlaceholder: "Channel URL or @handle",
  },
  {
    key: "threads",
    label: "Threads",
    description: "Connect your Threads account for conversational marketing and audience growth.",
    oauthAvailable: true,
    ctaText: "Connect",
    publicProfilePlaceholder: "@yourbrand",
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    description: "Connect your LinkedIn profile or organization page for professional authority and B2B reach.",
    oauthAvailable: true,
    ctaText: "Connect",
    publicProfilePlaceholder: "Company page URL or profile",
  },
  {
    key: "x",
    label: "X",
    description: "Connect your X account for real-time posts, community updates, and viral reach.",
    oauthAvailable: true,
    ctaText: "Connect",
    publicProfilePlaceholder: "@yourbrand",
  },
  {
    key: "whatsapp",
    label: "WhatsApp Number",
    description: "Verify your WhatsApp phone number to receive instant lead notifications and customer audit alerts.",
    oauthAvailable: false,
    ctaText: "Connect",
    publicProfilePlaceholder: "+91 98765 43210",
  },
];

export function StepConnectors({
  connections = [],
  onConnectionsChange,
}: {
  connections: SocialConnection[];
  onConnectionsChange: (next: SocialConnection[]) => void;
}) {
  // Manual public profile fallback state
  const [publicProfilePlatform, setPublicProfilePlatform] = useState<SocialPlatformKey | null>(null);
  const [publicProfileInput, setPublicProfileInput] = useState("");
  const [publicProfileError, setPublicProfileError] = useState<string | null>(null);

  // WhatsApp OTP verification modal state
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState("+91 ");
  const [whatsappOtp, setWhatsappOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  const [notification, setNotification] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  // Rehydrate fresh OAuth connections from server on mount and check query params
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);

    const oauthStatus = params.get("oauth");
    const provider = params.get("provider") || params.get("connected");
    const connectError = params.get("connect_error");

    if (oauthStatus === "success" || params.get("connected")) {
      const pLabel =
        provider === "google_business" || provider === "google"
          ? "Google Business"
          : provider === "x"
          ? "X"
          : provider === "linkedin"
          ? "LinkedIn"
          : provider === "threads"
          ? "Threads"
          : provider === "youtube"
          ? "YouTube"
          : provider === "instagram"
          ? "Instagram"
          : provider === "facebook"
          ? "Facebook"
          : provider
          ? provider.charAt(0).toUpperCase() + provider.slice(1)
          : "Channel";
      setNotification({ type: "success", message: `✓ ${pLabel} connected successfully!` });
    } else if (oauthStatus === "denied") {
      setNotification({ type: "info", message: "Connection request was cancelled. You can connect anytime later." });
    } else if (oauthStatus === "error" || connectError) {
      const pLabel =
        provider === "google_business" || provider === "google"
          ? "Google Business"
          : provider === "linkedin"
          ? "LinkedIn"
          : provider === "x"
          ? "X"
          : provider === "threads"
          ? "Threads"
          : provider === "youtube"
          ? "YouTube"
          : provider === "instagram"
          ? "Instagram"
          : provider === "facebook"
          ? "Facebook"
          : "Channel";
      setNotification({ type: "error", message: `${pLabel} connection failed. Please try again.` });
    }

    if (oauthStatus || connectError || params.get("connected")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("oauth");
      url.searchParams.delete("provider");
      url.searchParams.delete("connected");
      url.searchParams.delete("connect_error");
      window.history.replaceState({}, "", url.pathname);
    }

    void loadFreshServerOAuthConnections();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown timer for OTP resend cooldown
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  async function loadFreshServerOAuthConnections() {
    try {
      const res = await fetch("/api/platform/onboarding", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { oauthConnections?: Record<string, any> };
      const oauthConnections = body.oauthConnections ?? {};

      if (Object.keys(oauthConnections).length === 0) return;

      const updated = [...connections];
      for (const [platform, data] of Object.entries(oauthConnections)) {
        const key = (platform === "google" ? "google_business" : platform) as SocialPlatformKey;
        const idx = updated.findIndex((c) => c.platform === key);
        const conn: SocialConnection = {
          platform: key,
          handle: data.username ? (data.username.startsWith("@") || key === "whatsapp" ? data.username : `@${data.username}`) : undefined,
          displayName: data.displayName || data.username || key,
          status: "connected",
          connectionType: data.connectionType || "oauth",
          providerAccountId: data.providerAccountId,
          providerDisplayName: data.displayName || undefined,
          providerLabel: data.providerLabel || PROVIDER_LABELS[key] || "OAuth",
          connectedAt: data.connectedAt || new Date().toISOString(),
        };
        if (idx >= 0) {
          updated[idx] = conn;
        } else {
          updated.push(conn);
        }
      }

      onConnectionsChange(updated);
    } catch {
      // Non-blocking trace
    }
  }

  function startOAuth(platform: SocialPlatformKey) {
    const routePlatform = platform === "google_business" ? "google_business" : platform;
    window.location.href = `/api/social/oauth/${routePlatform}/connect?redirectTo=/app`;
  }

  function handleDisconnect(platform: SocialPlatformKey) {
    const nextConnections = connections.filter((c) => c.platform !== platform);
    nextConnections.push({
      platform,
      status: "not_connected",
    });
    onConnectionsChange(nextConnections);
  }

  // --- WhatsApp OTP Handlers ---
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
        setOtpError(data.error || "Failed to send OTP. Check phone number format.");
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
        setOtpError(data.error || "Invalid OTP. Please check the code and retry.");
        return;
      }

      // Success! Update connection list
      const verifiedPhone = data.verifiedNumber || whatsappPhone;
      const nextConnections = connections.filter((c) => c.platform !== "whatsapp");
      nextConnections.push({
        platform: "whatsapp",
        handle: verifiedPhone,
        displayName: verifiedPhone,
        status: "connected",
        connectionType: "otp_verified",
        providerAccountId: verifiedPhone,
        providerLabel: "WhatsApp Verified",
        connectedAt: new Date().toISOString(),
      });
      onConnectionsChange(nextConnections);

      setWhatsappModalOpen(false);
      setOtpSent(false);
      setWhatsappOtp("");
      setNotification({ type: "success", message: `✓ WhatsApp number ${verifiedPhone} verified successfully!` });
    } catch {
      setOtpError("Network error verifying OTP. Please try again.");
    } finally {
      setOtpLoading(false);
    }
  }

  // --- Manual Public Profile Fallback ---
  function handleSavePublicProfile() {
    if (!publicProfilePlatform) return;
    const trimmed = publicProfileInput.trim();
    if (!trimmed) {
      setPublicProfileError("Enter a handle, URL, or identifier.");
      return;
    }

    let handle = trimmed;
    if (["instagram", "threads", "youtube", "x"].includes(publicProfilePlatform)) {
      if (!handle.startsWith("@") && !handle.startsWith("http")) handle = `@${handle}`;
    }

    const nextConnections = connections.filter((c) => c.platform !== publicProfilePlatform);
    nextConnections.push({
      platform: publicProfilePlatform,
      handle: handle.startsWith("@") || publicProfilePlatform === "whatsapp" ? handle : undefined,
      url: handle.startsWith("http") ? handle : undefined,
      displayName: handle,
      status: "connected",
      connectionType: "public_profile",
      connectedAt: new Date().toISOString(),
    });

    onConnectionsChange(nextConnections);
    setPublicProfilePlatform(null);
    setPublicProfileInput("");
    setPublicProfileError(null);
  }

  return (
    <div className="flex flex-col gap-5 w-full">
      <div>
        <h3 className="font-sx-sans text-base font-semibold text-sx-text">Connect your business channels</h3>
        <p className="font-sx-sans text-xs text-sx-text-muted mt-1">
          Connect your Google Business Profile, social channels, and WhatsApp number. You can skip any channel and connect it later.
        </p>
      </div>

      {notification && (
        <div
          className={`flex items-center justify-between rounded-sx-sm px-3.5 py-2.5 text-xs font-medium ${
            notification.type === "success"
              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : notification.type === "error"
              ? "border border-rose-400/30 bg-rose-500/10 text-rose-300"
              : "border border-amber-500/30 bg-amber-500/10 text-amber-300"
          }`}
        >
          <span>{notification.message}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="ml-3 font-bold opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* 8 Connector Cards in Mandatory Order */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PLATFORM_CARDS.map((card) => {
          const connection = connections.find((c) => c.platform === card.key);
          const isOAuthConnected = connection?.status === "connected" && connection.connectionType === "oauth";
          const isOtpVerified = connection?.status === "connected" && connection.connectionType === "otp_verified";
          const isPublicProfile = connection?.status === "connected" && connection.connectionType === "public_profile";
          const isConnected = isOAuthConnected || isOtpVerified || isPublicProfile;
          const identifier = connection?.handle || connection?.displayName || connection?.url;

          const attributionText =
            isOtpVerified || card.key === "whatsapp"
              ? "✓ WhatsApp number verified"
              : isOAuthConnected
              ? `✓ Connected via ${connection?.providerLabel || PROVIDER_LABELS[card.key] || "OAuth"}`
              : null;

          return (
            <div
              key={card.key}
              data-platform={card.key}
              className={`flex flex-col justify-between p-3.5 rounded-sx-md border transition-colors min-h-[110px] ${
                isOAuthConnected || isOtpVerified
                  ? "border-emerald-500/30 bg-emerald-950/10"
                  : isPublicProfile
                  ? "border-amber-500/20 bg-amber-950/5"
                  : "border-sx-border bg-sx-surface-2/60 hover:bg-sx-surface-2"
              }`}
            >
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sx-sm bg-sx-surface-1 border border-sx-border mt-0.5">
                    <PlatformIcon name={card.key} className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-sx-sans text-xs font-bold text-sx-text truncate">{card.label}</p>
                    {isConnected ? (
                      <p
                        className={`font-sx-sans text-[11px] font-medium truncate flex items-center gap-1 mt-0.5 ${
                          isOAuthConnected || isOtpVerified ? "text-emerald-400" : "text-amber-400"
                        }`}
                      >
                        <span>{isOAuthConnected || isOtpVerified ? "✓" : "○"}</span>
                        <span className="truncate">{identifier || "Connected"}</span>
                      </p>
                    ) : (
                      <p className="font-sx-sans text-[11px] text-sx-text-muted line-clamp-2 mt-0.5">
                        {card.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="shrink-0">
                  {isConnected ? (
                    <button
                      type="button"
                      onClick={() => handleDisconnect(card.key)}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-sx-sm text-sx-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                      Disconnect
                    </button>
                  ) : card.key === "whatsapp" ? (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setWhatsappModalOpen(true);
                        setOtpError(null);
                        setOtpSent(false);
                        setWhatsappOtp("");
                      }}
                      className="h-8 text-xs font-semibold px-3 bg-sx-accent text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)] shadow-xs"
                    >
                      Connect
                    </Button>
                  ) : card.oauthAvailable ? (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => startOAuth(card.key)}
                      className="h-8 text-xs font-semibold px-3 bg-sx-accent text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)] shadow-xs"
                    >
                      Connect
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setPublicProfilePlatform(card.key);
                        setPublicProfileInput("");
                        setPublicProfileError(null);
                      }}
                      className="h-8 text-xs font-semibold px-3"
                    >
                      Connect
                    </Button>
                  )}
                </div>
              </div>

              {/* Attribution footer / badges */}
              <div className="mt-2 pl-10">
                {attributionText && (
                  <p className="text-[10px] text-emerald-400 font-medium">
                    {attributionText}
                  </p>
                )}

                {isPublicProfile && (
                  <p className="text-[10px] text-amber-400/70 font-medium">
                    Public profile only — not an authorized connection
                  </p>
                )}

                {/* Secondary manual public profile link */}
                {!isConnected && card.oauthAvailable && card.publicProfilePlaceholder && (
                  <button
                    type="button"
                    onClick={() => {
                      setPublicProfilePlatform(card.key);
                      setPublicProfileInput("");
                      setPublicProfileError(null);
                    }}
                    className="text-[10px] text-sx-text-subtle hover:text-sx-text-muted underline underline-offset-2 text-left block mt-1"
                  >
                    Add public profile manually instead
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-sx-text-subtle text-center mt-1">
        You can skip channels now and connect them anytime from your workspace dashboard.
      </p>

      {/* WhatsApp OTP Verification Modal */}
      {whatsappModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="whatsapp-otp-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-sx-lg border border-sx-border bg-sx-surface-1 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <PlatformIcon name="whatsapp" className="h-5 w-5" />
                <h4 id="whatsapp-otp-dialog-title" className="font-sx-sans text-base font-bold text-sx-text">
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
                <FormField label="WhatsApp Phone Number" htmlFor="whatsapp-phone-input">
                  <Input
                    id="whatsapp-phone-input"
                    value={whatsappPhone}
                    onChange={(e) => setWhatsappPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    autoFocus
                    className="h-11 text-sm font-mono"
                  />
                </FormField>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="touch"
                    onClick={() => setWhatsappModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="touch"
                    onClick={handleSendWhatsappOtp}
                    disabled={otpLoading}
                  >
                    {otpLoading ? "Sending OTP…" : "Send OTP on WhatsApp"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <FormField label="Enter 6-Digit Code" htmlFor="whatsapp-otp-input">
                  <Input
                    id="whatsapp-otp-input"
                    value={whatsappOtp}
                    onChange={(e) => setWhatsappOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    autoFocus
                    maxLength={6}
                    className="h-12 text-center text-lg font-mono tracking-widest"
                  />
                </FormField>

                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={handleSendWhatsappOtp}
                    disabled={cooldownSeconds > 0 || otpLoading}
                    className="text-sx-accent hover:underline disabled:opacity-50 disabled:no-underline"
                  >
                    {cooldownSeconds > 0 ? `Resend in ${cooldownSeconds}s` : "Resend OTP"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOtpSent(false)}
                    className="text-sx-text-subtle hover:text-sx-text-muted"
                  >
                    Change Number
                  </button>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="touch"
                    onClick={() => setWhatsappModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="touch"
                    onClick={handleVerifyWhatsappOtp}
                    disabled={otpLoading || whatsappOtp.length < 6}
                  >
                    {otpLoading ? "Verifying…" : "Verify OTP"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual Public Profile Input Dialog */}
      {publicProfilePlatform && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="public-profile-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-sx-lg border border-sx-border bg-sx-surface-1 p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <PlatformIcon name={publicProfilePlatform} className="h-5 w-5" />
                <h4 id="public-profile-dialog-title" className="font-sx-sans text-base font-semibold text-sx-text">
                  Add public profile
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setPublicProfilePlatform(null)}
                className="text-sx-text-muted hover:text-sx-text text-sm"
              >
                ✕
              </button>
            </div>

            <div className="rounded-sx-sm border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <p className="text-xs text-amber-300 font-medium">
                This adds a public profile reference only.
              </p>
              <p className="text-[11px] text-amber-300/70 mt-0.5">
                StratXcel can use this for audit research, but cannot manage or publish to this account without a real provider connection.
              </p>
            </div>

            <FormField
              label={`${PLATFORM_CARDS.find((c) => c.key === publicProfilePlatform)?.label} public profile`}
              htmlFor="public-profile-input"
              error={publicProfileError}
            >
              <Input
                id="public-profile-input"
                value={publicProfileInput}
                onChange={(e) => setPublicProfileInput(e.target.value)}
                placeholder={PLATFORM_CARDS.find((c) => c.key === publicProfilePlatform)?.publicProfilePlaceholder || "Handle, URL, or identifier"}
                autoFocus
                className="h-11 text-sm font-mono"
              />
            </FormField>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="touch"
                onClick={() => setPublicProfilePlatform(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="touch"
                onClick={handleSavePublicProfile}
              >
                Save Public Profile
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
