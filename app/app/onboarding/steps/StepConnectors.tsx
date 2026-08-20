"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FormField } from "../FormField";
import { PlatformIcon } from "@/components/audit/PlatformIcon";
import type { SocialConnection, SocialPlatformKey, V1SocialPlatformKey } from "../types";
import { V1_CONNECTORS } from "../types";

/** Provider label used for OAuth attribution in UI. */
const PROVIDER_LABELS: Partial<Record<SocialPlatformKey, string>> = {
  google_business: "Google",
  google_search_console: "Google Search Console",
  google_analytics: "Google Analytics",
  instagram: "Meta",
  facebook: "Meta",
  youtube: "Google",
  whatsapp: "WhatsApp Verified",
};

interface GoogleResourcesState {
  status: "connected" | "disconnected" | "error";
  searchConsoleSiteUrl: string | null;
  ga4PropertyId: string | null;
  ga4PropertyDisplayName: string | null;
  searchConsoleSites: Array<{ siteUrl: string; permissionLevel: string }>;
  searchConsoleError: string | null;
  ga4Properties: Array<{ propertyId: string; displayName: string }>;
  ga4Error: string | null;
}

export function StepConnectors({
  connections = [],
  onConnectionsChange,
}: {
  connections: SocialConnection[];
  onConnectionsChange: (next: SocialConnection[]) => void;
}) {
  // Manual public profile fallback state — Add public profile manually (Not an authorized connection)
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

  // Google Search & GA4 live resources state
  const [googleResources, setGoogleResources] = useState<GoogleResourcesState | null>(null);
  const [pendingSite, setPendingSite] = useState<string>("");
  const [pendingGa4, setPendingGa4] = useState<string>("");
  const [savingGoogle, setSavingGoogle] = useState(false);
  const [googleSaveSuccess, setGoogleSaveSuccess] = useState<string | null>(null);

  const [notification, setNotification] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  // Rehydrate fresh OAuth connections & Google Search state on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);

    const oauthStatus = params.get("oauth");
    const provider = params.get("provider") || params.get("connected");
    const googleConnected = params.get("googleConnected");
    const connectError = params.get("connect_error") || params.get("googleConnectError");

    if (googleConnected === "1" || provider === "google_search") {
      setNotification({ type: "success", message: "✓ Google Search & Analytics connected! Select your properties below." });
    } else if (oauthStatus === "success" || params.get("connected")) {
      const pLabel =
        provider === "google_business" || provider === "google"
          ? "Google Business Profile"
          : provider === "youtube"
          ? "YouTube"
          : provider === "instagram"
          ? "Instagram"
          : provider === "facebook"
          ? "Facebook"
          : provider === "whatsapp"
          ? "WhatsApp Number"
          : "Channel";
      setNotification({ type: "success", message: `✓ ${pLabel} connected successfully!` });
    } else if (oauthStatus === "denied" || params.get("googleConnectError") === "denied") {
      setNotification({ type: "info", message: "Connection request was cancelled. You can connect anytime later." });
    } else if (oauthStatus === "error" || connectError) {
      setNotification({ type: "error", message: "Connection failed. Please try again." });
    }

    if (oauthStatus || connectError || params.get("connected") || googleConnected) {
      const url = new URL(window.location.href);
      url.searchParams.delete("oauth");
      url.searchParams.delete("provider");
      url.searchParams.delete("connected");
      url.searchParams.delete("connect_error");
      url.searchParams.delete("googleConnected");
      url.searchParams.delete("googleConnectError");
      window.history.replaceState({}, "", url.pathname);
    }

    void loadFreshServerOAuthConnections();
    void loadGoogleResources();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown timer for OTP resend cooldown
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  async function loadGoogleResources() {
    try {
      const res = await fetch("/api/platform/search/google/resources", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as GoogleResourcesState;
      setGoogleResources(data);
      if (data.searchConsoleSiteUrl) setPendingSite(data.searchConsoleSiteUrl);
      if (data.ga4PropertyId) setPendingGa4(data.ga4PropertyId);

      // Sync into connections list
      const next = [...connections];
      let changed = false;

      if (data.status === "connected" && data.searchConsoleSiteUrl) {
        const idx = next.findIndex((c) => c.platform === "google_search_console");
        const conn: SocialConnection = {
          platform: "google_search_console",
          displayName: data.searchConsoleSiteUrl,
          handle: data.searchConsoleSiteUrl,
          status: "connected",
          connectionType: "oauth",
          providerLabel: "Google Search Console",
          propertyId: data.searchConsoleSiteUrl,
          connectedAt: new Date().toISOString(),
        };
        if (idx >= 0) next[idx] = conn;
        else next.push(conn);
        changed = true;
      }

      if (data.status === "connected" && data.ga4PropertyId) {
        const idx = next.findIndex((c) => c.platform === "google_analytics");
        const conn: SocialConnection = {
          platform: "google_analytics",
          displayName: data.ga4PropertyDisplayName || `GA4: ${data.ga4PropertyId}`,
          handle: data.ga4PropertyId,
          status: "connected",
          connectionType: "oauth",
          providerLabel: "Google Analytics",
          propertyId: data.ga4PropertyId,
          propertyDisplayName: data.ga4PropertyDisplayName || undefined,
          connectedAt: new Date().toISOString(),
        };
        if (idx >= 0) next[idx] = conn;
        else next.push(conn);
        changed = true;
      }

      if (changed) {
        onConnectionsChange(next);
      }
    } catch {
      // Non-fatal
    }
  }

  async function loadFreshServerOAuthConnections() {
    try {
      const res = await fetch("/api/platform/onboarding", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { oauthConnections?: Record<string, any>; googleSearch?: any };
      const oauthConnections = body.oauthConnections ?? {};

      if (Object.keys(oauthConnections).length === 0 && !body.googleSearch) return;

      const updated = [...connections];
      for (const [platform, data] of Object.entries(oauthConnections)) {
        const key = (platform === "google" ? "google_business" : platform) as SocialPlatformKey;
        if (!V1_CONNECTORS.includes(key as V1SocialPlatformKey)) continue;
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
    if (platform === "google_search_console" || platform === "google_analytics") {
      window.location.href = `/api/platform/search/google/connect?redirectTo=/app`;
      return;
    }
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

  async function handleSaveGoogleProperties() {
    setSavingGoogle(true);
    setGoogleSaveSuccess(null);
    try {
      const selectedGa4Obj = googleResources?.ga4Properties?.find((p) => p.propertyId === pendingGa4);
      const res = await fetch("/api/platform/search/google/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchConsoleSiteUrl: pendingSite || null,
          ga4PropertyId: pendingGa4 || null,
          ga4PropertyDisplayName: selectedGa4Obj?.displayName || null,
        }),
      });

      if (!res.ok) {
        setNotification({ type: "error", message: "Failed to save Google property selection. Please retry." });
        return;
      }

      setGoogleSaveSuccess("✓ Google Search Console & GA4 property selections saved!");
      setTimeout(() => setGoogleSaveSuccess(null), 4000);

      // Re-read resources and update connections
      await loadGoogleResources();
    } catch {
      setNotification({ type: "error", message: "Network error saving property selection." });
    } finally {
      setSavingGoogle(false);
    }
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

  // State helpers
  const gbpConn = connections.find((c) => c.platform === "google_business");
  const isGbpConnected = gbpConn?.status === "connected";

  const isGoogleSearchAuth = googleResources?.status === "connected";
  const gscConn = connections.find((c) => c.platform === "google_search_console");
  const isGscConnected = Boolean(isGoogleSearchAuth && (googleResources?.searchConsoleSiteUrl || gscConn?.status === "connected"));

  const ga4Conn = connections.find((c) => c.platform === "google_analytics");
  const isGa4Connected = Boolean(isGoogleSearchAuth && (googleResources?.ga4PropertyId || ga4Conn?.status === "connected"));

  const fbConn = connections.find((c) => c.platform === "facebook");
  const isFbConnected = fbConn?.status === "connected";

  const igConn = connections.find((c) => c.platform === "instagram");
  const isIgConnected = igConn?.status === "connected";

  const ytConn = connections.find((c) => c.platform === "youtube");
  const isYtConnected = ytConn?.status === "connected";

  const waConn = connections.find((c) => c.platform === "whatsapp");
  const isWaConnected = waConn?.status === "connected";

  return (
    <div className="flex flex-col gap-6 w-full">
      <div>
        <h3 className="font-sx-sans text-base font-semibold text-sx-text">Connect your business channels</h3>
        <p className="font-sx-sans text-xs text-sx-text-muted mt-1">
          Connect your Google services, social channels, and WhatsApp number. All connections are optional and can be managed anytime.
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

      {googleSaveSuccess && (
        <div className="rounded-sx-sm border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-medium text-emerald-300">
          {googleSaveSuccess}
        </div>
      )}

      {/* ============================================================ */}
      {/* 1. GOOGLE PROVIDER GROUP                                      */}
      {/* ============================================================ */}
      <div className="rounded-sx-md border border-sx-border bg-sx-surface-2/40 p-4 space-y-3.5">
        <div className="flex items-center justify-between border-b border-sx-border/60 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-sx-text-subtle">
              GOOGLE
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium">
              Search & Local Discovery
            </span>
          </div>
          <span className="text-[11px] text-sx-text-subtle">
            {isGbpConnected || isGscConnected || isGa4Connected ? (
              <span className="text-emerald-400 font-medium">✓ Connected</span>
            ) : (
              "Optional"
            )}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {/* 1A. Google Business Profile Card */}
          <div
            data-platform="google_business"
            className={`flex flex-col justify-between p-3.5 rounded-sx-sm border transition-colors ${
              isGbpConnected ? "border-emerald-500/30 bg-emerald-950/10" : "border-sx-border bg-sx-surface-1/80"
            }`}
          >
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sx-sm bg-sx-surface-1 border border-sx-border mt-0.5">
                  <PlatformIcon name="google_business" className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-sx-sans text-xs font-bold text-sx-text truncate">Google Business Profile</p>
                  {isGbpConnected ? (
                    <div>
                      <p className="font-sx-sans text-[11px] font-medium text-emerald-400 truncate flex items-center gap-1 mt-0.5">
                        <span>✓</span>
                        <span className="truncate">{gbpConn?.displayName || gbpConn?.handle || "Connected"}</span>
                      </p>
                      <p className="text-[10px] text-emerald-400/70 font-medium mt-0.5">
                        ✓ Connected via {gbpConn?.providerLabel || "Google"}
                      </p>
                    </div>
                  ) : (
                    <p className="font-sx-sans text-[11px] text-sx-text-muted mt-0.5">
                      Sync reviews, map listing, and local business information.
                    </p>
                  )}
                </div>
              </div>

              <div className="shrink-0">
                {isGbpConnected ? (
                  <button
                    type="button"
                    onClick={() => handleDisconnect("google_business")}
                    className="px-2.5 py-1 text-[11px] font-medium rounded-sx-sm text-sx-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                  >
                    Disconnect
                  </button>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => startOAuth("google_business")}
                    className="h-8 text-xs font-semibold px-3 bg-sx-accent text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)] shadow-xs"
                  >
                    Connect
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* 1B. Google Search Console Card */}
          <div
            data-platform="google_search_console"
            className={`flex flex-col justify-between p-3.5 rounded-sx-sm border transition-colors ${
              isGscConnected ? "border-emerald-500/30 bg-emerald-950/10" : "border-sx-border bg-sx-surface-1/80"
            }`}
          >
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sx-sm bg-sx-surface-1 border border-sx-border mt-0.5">
                  <PlatformIcon name="google_search_console" className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-sx-sans text-xs font-bold text-sx-text truncate">Google Search Console</p>
                  {isGscConnected ? (
                    <p className="font-sx-sans text-[11px] font-medium text-emerald-400 truncate flex items-center gap-1 mt-0.5">
                      <span>✓</span>
                      <span className="truncate">{googleResources?.searchConsoleSiteUrl || gscConn?.displayName || "Connected"}</span>
                    </p>
                  ) : (
                    <p className="font-sx-sans text-[11px] text-sx-text-muted mt-0.5">
                      Direct search queries, impressions, and indexed pages evidence.
                    </p>
                  )}
                </div>
              </div>

              <div className="shrink-0">
                {!isGoogleSearchAuth ? (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => startOAuth("google_search_console")}
                    className="h-8 text-xs font-semibold px-3 bg-sx-accent text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)] shadow-xs"
                  >
                    Connect
                  </Button>
                ) : (
                  <span className="text-[11px] text-emerald-400 font-medium px-2 py-0.5 rounded bg-emerald-500/10">
                    Google Connected
                  </span>
                )}
              </div>
            </div>

            {/* In-place Search Console Property Selector */}
            {isGoogleSearchAuth && (
              <div className="mt-3 pt-3 border-t border-sx-border/60 pl-10 space-y-2">
                <label className="text-[11px] font-medium text-sx-text block">
                  Select Search Console Property:
                </label>
                {googleResources?.searchConsoleSites && googleResources.searchConsoleSites.length > 0 ? (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <select
                      value={pendingSite}
                      onChange={(e) => setPendingSite(e.target.value)}
                      className="h-8 px-2.5 rounded-sx-sm border border-sx-border bg-sx-surface-1 text-xs text-sx-text focus:border-sx-accent outline-none flex-1 font-mono"
                    >
                      <option value="">-- Choose verified site --</option>
                      {googleResources.searchConsoleSites.map((site) => (
                        <option key={site.siteUrl} value={site.siteUrl}>
                          {site.siteUrl}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={handleSaveGoogleProperties}
                      disabled={savingGoogle || !pendingSite}
                      className="h-8 text-xs shrink-0"
                    >
                      {savingGoogle ? "Saving…" : "Save Selection"}
                    </Button>
                  </div>
                ) : (
                  <p className="text-[11px] text-sx-text-muted italic">
                    No Search Console properties found for this Google account.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 1C. Google Analytics (GA4) Card */}
          <div
            data-platform="google_analytics"
            className={`flex flex-col justify-between p-3.5 rounded-sx-sm border transition-colors ${
              isGa4Connected ? "border-emerald-500/30 bg-emerald-950/10" : "border-sx-border bg-sx-surface-1/80"
            }`}
          >
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sx-sm bg-sx-surface-1 border border-sx-border mt-0.5">
                  <PlatformIcon name="google_analytics" className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-sx-sans text-xs font-bold text-sx-text truncate">Google Analytics (GA4)</p>
                  {isGa4Connected ? (
                    <p className="font-sx-sans text-[11px] font-medium text-emerald-400 truncate flex items-center gap-1 mt-0.5">
                      <span>✓</span>
                      <span className="truncate">
                        {googleResources?.ga4PropertyDisplayName || ga4Conn?.displayName || `Property ${googleResources?.ga4PropertyId}`}
                      </span>
                    </p>
                  ) : (
                    <p className="font-sx-sans text-[11px] text-sx-text-muted mt-0.5">
                      Organic traffic volume, visitor conversions, and audience metrics.
                    </p>
                  )}
                </div>
              </div>

              <div className="shrink-0">
                {!isGoogleSearchAuth ? (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => startOAuth("google_analytics")}
                    className="h-8 text-xs font-semibold px-3 bg-sx-accent text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)] shadow-xs"
                  >
                    Connect
                  </Button>
                ) : (
                  <span className="text-[11px] text-emerald-400 font-medium px-2 py-0.5 rounded bg-emerald-500/10">
                    Google Connected
                  </span>
                )}
              </div>
            </div>

            {/* In-place GA4 Property Selector */}
            {isGoogleSearchAuth && (
              <div className="mt-3 pt-3 border-t border-sx-border/60 pl-10 space-y-2">
                <label className="text-[11px] font-medium text-sx-text block">
                  Select GA4 Property:
                </label>
                {googleResources?.ga4Properties && googleResources.ga4Properties.length > 0 ? (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <select
                      value={pendingGa4}
                      onChange={(e) => setPendingGa4(e.target.value)}
                      className="h-8 px-2.5 rounded-sx-sm border border-sx-border bg-sx-surface-1 text-xs text-sx-text focus:border-sx-accent outline-none flex-1 font-mono"
                    >
                      <option value="">-- Choose GA4 Property --</option>
                      {googleResources.ga4Properties.map((prop) => (
                        <option key={prop.propertyId} value={prop.propertyId}>
                          {prop.displayName} ({prop.propertyId})
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={handleSaveGoogleProperties}
                      disabled={savingGoogle || !pendingGa4}
                      className="h-8 text-xs shrink-0"
                    >
                      {savingGoogle ? "Saving…" : "Save Selection"}
                    </Button>
                  </div>
                ) : (
                  <p className="text-[11px] text-sx-text-muted italic">
                    No GA4 properties found for this Google account.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. META PROVIDER GROUP (Facebook + Instagram)                */}
      {/* ============================================================ */}
      <div className="rounded-sx-md border border-sx-border bg-sx-surface-2/40 p-4 space-y-3.5">
        <div className="flex items-center justify-between border-b border-sx-border/60 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-sx-text-subtle">
              META
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 font-medium">
              Social Channels
            </span>
          </div>
          <span className="text-[11px] text-sx-text-subtle">
            {isFbConnected || isIgConnected ? (
              <span className="text-emerald-400 font-medium">✓ Connected</span>
            ) : (
              "Optional"
            )}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Instagram */}
          <div
            data-platform="instagram"
            className={`flex flex-col justify-between p-3.5 rounded-sx-sm border transition-colors ${
              isIgConnected ? "border-emerald-500/30 bg-emerald-950/10" : "border-sx-border bg-sx-surface-1/80"
            }`}
          >
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sx-sm bg-sx-surface-1 border border-sx-border mt-0.5">
                  <PlatformIcon name="instagram" className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-sx-sans text-xs font-bold text-sx-text truncate">Instagram Business</p>
                  {isIgConnected ? (
                    <div>
                      <p className="font-sx-sans text-[11px] font-medium text-emerald-400 truncate flex items-center gap-1 mt-0.5">
                        <span>✓</span>
                        <span className="truncate">{igConn?.displayName || igConn?.handle || "Connected"}</span>
                      </p>
                      <p className="text-[10px] text-emerald-400/70 font-medium mt-0.5">
                        ✓ Connected via {igConn?.providerLabel || "Meta"}
                      </p>
                    </div>
                  ) : (
                    <p className="font-sx-sans text-[11px] text-sx-text-muted mt-0.5">
                      Automate publishing, stories, & track insights.
                    </p>
                  )}
                </div>
              </div>

              <div className="shrink-0">
                {isIgConnected ? (
                  <button
                    type="button"
                    onClick={() => handleDisconnect("instagram")}
                    className="px-2.5 py-1 text-[11px] font-medium rounded-sx-sm text-sx-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                  >
                    Disconnect
                  </button>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => startOAuth("instagram")}
                    className="h-8 text-xs font-semibold px-3 bg-sx-accent text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)] shadow-xs"
                  >
                    Connect
                  </Button>
                )}
              </div>
            </div>

            {!isIgConnected && (
              <div className="mt-2 pl-10">
                <button
                  type="button"
                  onClick={() => {
                    setPublicProfilePlatform("instagram");
                    setPublicProfileInput("");
                    setPublicProfileError(null);
                  }}
                  className="text-[10px] text-sx-text-subtle hover:text-sx-text-muted underline underline-offset-2 text-left block"
                >
                  Add @handle manually
                </button>
              </div>
            )}
          </div>

          {/* Facebook */}
          <div
            data-platform="facebook"
            className={`flex flex-col justify-between p-3.5 rounded-sx-sm border transition-colors ${
              isFbConnected ? "border-emerald-500/30 bg-emerald-950/10" : "border-sx-border bg-sx-surface-1/80"
            }`}
          >
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sx-sm bg-sx-surface-1 border border-sx-border mt-0.5">
                  <PlatformIcon name="facebook" className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-sx-sans text-xs font-bold text-sx-text truncate">Facebook Page</p>
                  {isFbConnected ? (
                    <div>
                      <p className="font-sx-sans text-[11px] font-medium text-emerald-400 truncate flex items-center gap-1 mt-0.5">
                        <span>✓</span>
                        <span className="truncate">{fbConn?.displayName || fbConn?.handle || "Connected"}</span>
                      </p>
                      <p className="text-[10px] text-emerald-400/70 font-medium mt-0.5">
                        ✓ Connected via {fbConn?.providerLabel || "Meta"}
                      </p>
                    </div>
                  ) : (
                    <p className="font-sx-sans text-[11px] text-sx-text-muted mt-0.5">
                      Content distribution & audience community.
                    </p>
                  )}
                </div>
              </div>

              <div className="shrink-0">
                {isFbConnected ? (
                  <button
                    type="button"
                    onClick={() => handleDisconnect("facebook")}
                    className="px-2.5 py-1 text-[11px] font-medium rounded-sx-sm text-sx-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                  >
                    Disconnect
                  </button>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => startOAuth("facebook")}
                    className="h-8 text-xs font-semibold px-3 bg-sx-accent text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)] shadow-xs"
                  >
                    Connect
                  </Button>
                )}
              </div>
            </div>

            {!isFbConnected && (
              <div className="mt-2 pl-10">
                <button
                  type="button"
                  onClick={() => {
                    setPublicProfilePlatform("facebook");
                    setPublicProfileInput("");
                    setPublicProfileError(null);
                  }}
                  className="text-[10px] text-sx-text-subtle hover:text-sx-text-muted underline underline-offset-2 text-left block"
                >
                  Add public page URL manually
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 3. YOUTUBE PROVIDER GROUP                                    */}
      {/* ============================================================ */}
      <div className="rounded-sx-md border border-sx-border bg-sx-surface-2/40 p-4 space-y-3.5">
        <div className="flex items-center justify-between border-b border-sx-border/60 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-sx-text-subtle">
              YOUTUBE
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-medium">
              Video & Content
            </span>
          </div>
          <span className="text-[11px] text-sx-text-subtle">
            {isYtConnected ? <span className="text-emerald-400 font-medium">✓ Connected</span> : "Optional"}
          </span>
        </div>

        <div
          data-platform="youtube"
          className={`flex flex-col justify-between p-3.5 rounded-sx-sm border transition-colors ${
            isYtConnected ? "border-emerald-500/30 bg-emerald-950/10" : "border-sx-border bg-sx-surface-1/80"
          }`}
        >
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sx-sm bg-sx-surface-1 border border-sx-border mt-0.5">
                <PlatformIcon name="youtube" className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="font-sx-sans text-xs font-bold text-sx-text truncate">YouTube Channel</p>
                {isYtConnected ? (
                  <div>
                    <p className="font-sx-sans text-[11px] font-medium text-emerald-400 truncate flex items-center gap-1 mt-0.5">
                      <span>✓</span>
                      <span className="truncate">{ytConn?.displayName || ytConn?.handle || "Connected"}</span>
                    </p>
                    <p className="text-[10px] text-emerald-400/70 font-medium mt-0.5">
                      ✓ Connected via {ytConn?.providerLabel || "Google"}
                    </p>
                  </div>
                ) : (
                  <p className="font-sx-sans text-[11px] text-sx-text-muted mt-0.5">
                    Video publishing, shorts distribution, and performance tracking.
                  </p>
                )}
              </div>
            </div>

            <div className="shrink-0">
              {isYtConnected ? (
                <button
                  type="button"
                  onClick={() => handleDisconnect("youtube")}
                  className="px-2.5 py-1 text-[11px] font-medium rounded-sx-sm text-sx-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                >
                  Disconnect
                </button>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => startOAuth("youtube")}
                  className="h-8 text-xs font-semibold px-3 bg-sx-accent text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)] shadow-xs"
                >
                  Connect
                </Button>
              )}
            </div>
          </div>

          {!isYtConnected && (
            <div className="mt-2 pl-10">
              <button
                type="button"
                onClick={() => {
                  setPublicProfilePlatform("youtube");
                  setPublicProfileInput("");
                  setPublicProfileError(null);
                }}
                className="text-[10px] text-sx-text-subtle hover:text-sx-text-muted underline underline-offset-2 text-left block"
              >
                Add channel URL manually
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 4. WHATSAPP PROVIDER GROUP                                   */}
      {/* ============================================================ */}
      <div className="rounded-sx-md border border-sx-border bg-sx-surface-2/40 p-4 space-y-3.5">
        <div className="flex items-center justify-between border-b border-sx-border/60 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-sx-text-subtle">
              WHATSAPP
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium">
              Direct Communication & Alerts
            </span>
          </div>
          <span className="text-[11px] text-sx-text-subtle">
            {isWaConnected ? <span className="text-emerald-400 font-medium">✓ Verified</span> : "Optional"}
          </span>
        </div>

        <div
          data-platform="whatsapp"
          className={`flex flex-col justify-between p-3.5 rounded-sx-sm border transition-colors ${
            isWaConnected ? "border-emerald-500/30 bg-emerald-950/10" : "border-sx-border bg-sx-surface-1/80"
          }`}
        >
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sx-sm bg-sx-surface-1 border border-sx-border mt-0.5">
                <PlatformIcon name="whatsapp" className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="font-sx-sans text-xs font-bold text-sx-text truncate">WhatsApp Number</p>
                {isWaConnected ? (
                  <p className="font-sx-sans text-[11px] font-medium text-emerald-400 truncate flex items-center gap-1 mt-0.5">
                    <span>✓ Verified</span>
                    <span className="truncate ml-1 font-mono text-[10px] text-emerald-300">
                      ({waConn?.handle || waConn?.displayName})
                    </span>
                  </p>
                ) : (
                  <p className="font-sx-sans text-[11px] text-sx-text-muted mt-0.5">
                    Verify the phone number you use for WhatsApp to receive instant updates and audit alerts.
                  </p>
                )}
              </div>
            </div>

            <div className="shrink-0">
              {isWaConnected ? (
                <button
                  type="button"
                  onClick={() => handleDisconnect("whatsapp")}
                  className="px-2.5 py-1 text-[11px] font-medium rounded-sx-sm text-sx-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                >
                  Disconnect
                </button>
              ) : (
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
                  Verify
                </Button>
              )}
            </div>
          </div>
        </div>
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
                <div className="rounded-sx-sm bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-xs text-emerald-300">
                  <p className="font-semibold">WhatsApp code sent to {whatsappPhone}</p>
                  <p className="text-[11px] text-emerald-400/80 mt-0.5">
                    Check your WhatsApp for the 6-digit verification code.
                  </p>
                </div>

                <FormField label="6-Digit Verification Code" htmlFor="whatsapp-otp-input">
                  <Input
                    id="whatsapp-otp-input"
                    value={whatsappOtp}
                    onChange={(e) => setWhatsappOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    autoFocus
                    maxLength={6}
                    className="h-11 text-center font-mono text-lg tracking-widest"
                  />
                </FormField>

                <div className="flex items-center justify-between pt-2">
                  {cooldownSeconds > 0 ? (
                    <span className="text-xs text-sx-text-subtle font-mono">
                      Resend code in {cooldownSeconds}s
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSendWhatsappOtp}
                      disabled={otpLoading}
                      className="text-xs text-sx-accent hover:underline font-medium"
                    >
                      Resend WhatsApp OTP
                    </button>
                  )}

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="touch"
                      onClick={() => {
                        setOtpSent(false);
                        setWhatsappOtp("");
                      }}
                    >
                      Change Number
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      size="touch"
                      onClick={handleVerifyWhatsappOtp}
                      disabled={otpLoading || whatsappOtp.length !== 6}
                    >
                      {otpLoading ? "Verifying…" : "Verify Code"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual Public Profile Fallback Dialog */}
      {publicProfilePlatform && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="public-profile-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-sx-lg border border-sx-border bg-sx-surface-1 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <PlatformIcon name={publicProfilePlatform} className="h-5 w-5" />
                <h4 id="public-profile-dialog-title" className="font-sx-sans text-base font-bold text-sx-text">
                  Add Public Profile
                </h4>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPublicProfilePlatform(null);
                  setPublicProfileInput("");
                  setPublicProfileError(null);
                }}
                className="text-sx-text-muted hover:text-sx-text text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-sx-text-muted">
              Add your public profile link or username for reference during your audit.
            </p>

            {publicProfileError && (
              <div className="rounded-sx-sm border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                {publicProfileError}
              </div>
            )}

            <div className="space-y-4">
              <FormField label="Public Profile Link / Handle" htmlFor="public-profile-input">
                <Input
                  id="public-profile-input"
                  value={publicProfileInput}
                  onChange={(e) => setPublicProfileInput(e.target.value)}
                  placeholder="@yourbrand or https://..."
                  autoFocus
                  className="h-11 text-sm"
                />
              </FormField>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="touch"
                  onClick={() => {
                    setPublicProfilePlatform(null);
                    setPublicProfileInput("");
                    setPublicProfileError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="touch"
                  onClick={handleSavePublicProfile}
                >
                  Save Profile
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
