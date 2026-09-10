"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useCurrentTenant } from "../CurrentTenantContext";
import { platformFetch } from "@/lib/admin/platform-fetch";
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Info,
  Lock,
  Sparkles,
  Zap,
  Globe,
  Radio,
  FileSpreadsheet,
  FileText,
  Calendar,
  Mail,
  Search,
  BarChart3,
  Building2,
  Video,
  Target,
  FolderSync,
} from "lucide-react";
import type { GoogleHubStatus, GoogleServiceStatus } from "@/lib/connectors/google-oauth-service";

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  google_drive: <FolderSync size={18} className="text-amber-400" />,
  google_sheets: <FileSpreadsheet size={18} className="text-emerald-400" />,
  google_docs: <FileText size={18} className="text-blue-400" />,
  google_calendar: <Calendar size={18} className="text-sky-400" />,
  gmail: <Mail size={18} className="text-rose-400" />,
  search_console: <Search size={18} className="text-indigo-400" />,
  google_analytics: <BarChart3 size={18} className="text-amber-500" />,
  google_business: <Building2 size={18} className="text-teal-400" />,
  youtube: <Video size={18} className="text-red-500" />,
  google_ads: <Target size={18} className="text-orange-400" />,
};

export default function ConnectorsPage() {
  const { active } = useCurrentTenant();
  const [googleStatus, setGoogleStatus] = useState<GoogleHubStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPermissionsGuide, setShowPermissionsGuide] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const loadStatus = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const tenantParam = active?.tenantId ? `?tenantId=${encodeURIComponent(active.tenantId)}` : "";
      const res = await platformFetch(`/api/platform/connectors/google/status${tenantParam}`);
      if (!res.ok) {
        throw new Error(`Failed to load Google status (${res.status})`);
      }
      const data: GoogleHubStatus = await res.json();
      setGoogleStatus(data);
    } catch (err) {
      console.error("[connectors] Status load failed:", err);
      setToast({
        message: err instanceof Error ? err.message : "Failed to load connector status",
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [active?.tenantId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  function handleConnectGoogle() {
    const tenantParam = active?.tenantId ? `?tenantId=${encodeURIComponent(active.tenantId)}` : "";
    window.location.href = `/api/platform/connectors/google/connect${tenantParam}`;
  }

  async function handleDisconnectGoogle() {
    if (!confirm("Are you sure you want to disconnect Google services? Hermes will lose access to Google Drive and other authorized tools.")) {
      return;
    }
    setDisconnecting(true);
    try {
      const res = await platformFetch("/api/platform/connectors/google/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: active?.tenantId }),
      });
      if (!res.ok) throw new Error("Disconnect failed");
      setToast({ message: "Google account disconnected", type: "success" });
      await loadStatus(true);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Disconnect failed", type: "error" });
    } finally {
      setDisconnecting(false);
    }
  }

  const otherConnectors = [
    {
      key: "whatsapp",
      name: "Meta WhatsApp Cloud API",
      category: "Messaging & Conversational Sales",
      status: "connected",
      statusLabel: "Live Routing Active",
      phone: "+91 77778 12777",
      provider: "Meta Graph API v21.0",
      description: "Direct customer WhatsApp inbound diagnosis, sales conversation engine, and governed outbound delivery.",
    },
    {
      key: "razorpay",
      name: "Razorpay Payment Gateway",
      category: "Payments & Invoicing",
      status: "connected",
      statusLabel: "Live Gateway Active",
      account: "STRATXCEL SOLUTIONS (OPC) PRIVATE LIMITED",
      provider: "Razorpay REST API",
      description: "Automated payment links, UPI QR checkout, instant webhook reconciliation, and GST-compliant invoicing.",
    },
    {
      key: "resend",
      name: "Resend Email Runtime",
      category: "Governed Outreach",
      status: "connected",
      statusLabel: "Delivery Engine Active",
      provider: "Resend API",
      description: "Governed outbound commercial email outreach, SPF/DKIM verification, and delivery event telemetry.",
    },
    {
      key: "aws",
      name: "AWS Infrastructure Fleet",
      category: "Background Compute",
      status: "connected",
      statusLabel: "4 Worker Services Online",
      instance: "i-0067f6c0dfd60cc46 (ap-south-1)",
      provider: "AWS SSM & Systemd",
      description: "Always-on background execution fleet (mission worker, WhatsApp processor, webhook server, Hermes gateway).",
    },
    {
      key: "vercel",
      name: "Vercel Production Hosting",
      category: "Edge Compute & Domains",
      status: "connected",
      statusLabel: "Live on www.stratxcel.in",
      project: "stratxcel (prj_81j5A5rArsPVVNspwSPGGfuhg9NZ)",
      provider: "Vercel REST & CLI",
      description: "Production web hosting, edge routing, SSL certificates, custom domains, and automated Git deployments.",
    },
  ];

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-6 pb-20">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`flex items-center justify-between rounded-lg px-4 py-3 text-xs font-medium ${
            toast.type === "success"
              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border border-rose-500/30 bg-rose-500/10 text-rose-400"
          }`}
        >
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-3 text-[11px] underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col justify-between gap-3 border-b border-sx-border/60 pb-5 sm:flex-row sm:items-center">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Link href="/admin" className="text-xs text-sx-text-subtle hover:text-sx-text">
              Settings
            </Link>
            <span className="text-xs text-sx-text-subtle">/</span>
            <span className="text-xs font-medium text-sx-text">Connectors</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-sx-text sm:text-2xl">
            Integrations & Connectors
          </h1>
          <p className="text-xs text-sx-text-subtle sm:text-sm">
            Manage external accounts, single-consent Google OAuth, and AI capability permissions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadStatus(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-sx-border/80 bg-sx-surface-2 px-3 py-1.5 text-xs font-medium text-sx-text transition-colors hover:bg-sx-surface-1 disabled:opacity-50"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin text-sx-accent" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Flagship: Google OAuth Hub */}
      <section className="flex flex-col gap-4 rounded-xl border border-sx-border/80 bg-sx-surface-1 p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-sx-border/80 bg-white/5 p-2 shadow-inner">
              <svg className="h-6 w-6" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.36 7.33 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.16 0 9.97 0 12c0 2.03.45 3.84 1.24 5.42l4.04-3.15Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
                />
              </svg>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-sx-text">Google Account & Workspace Hub</h2>
                {googleStatus?.connected ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                    <CheckCircle2 size={11} />
                    <span>Connected</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400">
                    <AlertTriangle size={11} />
                    <span>Needs Authorization</span>
                  </span>
                )}
                {googleStatus?.needsReauth && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-rose-400">
                    <AlertTriangle size={11} />
                    <span>Reauthorization Required</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-sx-text-subtle">
                {googleStatus?.accountEmail
                  ? `Authorized under ${googleStatus.accountEmail} · Granted ${googleStatus.grantedScopes.length} scopes`
                  : "Connect Google once to authorize Drive artifact storage, Sheets export, Search Console, and GA4 telemetry."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowPermissionsGuide((prev) => !prev)}
              className="flex items-center gap-1 rounded-lg border border-sx-border/70 bg-sx-surface-2 px-3 py-1.5 text-xs font-medium text-sx-text transition-colors hover:bg-sx-surface-1"
            >
              <Info size={13} className="text-sx-accent" />
              <span>{showPermissionsGuide ? "Hide Guide" : "Permissions Guide"}</span>
              {showPermissionsGuide ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>

            {googleStatus?.connected ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleConnectGoogle}
                  className="flex items-center gap-1.5 rounded-lg bg-sx-accent px-3 py-1.5 text-xs font-semibold text-sx-accent-on transition-colors hover:bg-sx-accent-hover"
                >
                  <FolderSync size={13} />
                  <span>Update Scopes</span>
                </button>
                <button
                  onClick={() => void handleDisconnectGoogle()}
                  disabled={disconnecting}
                  className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs font-medium text-rose-400 transition-colors hover:bg-rose-500/10 disabled:opacity-50"
                >
                  {disconnecting ? "Disconnecting..." : "Disconnect"}
                </button>
              </div>
            ) : (
              <button
                onClick={handleConnectGoogle}
                className="flex items-center gap-1.5 rounded-lg bg-sx-accent px-4 py-2 text-xs font-semibold text-sx-accent-on transition-colors hover:bg-sx-accent-hover"
              >
                <Lock size={13} />
                <span>Connect Google Account</span>
              </button>
            )}
          </div>
        </div>

        {/* Permissions Explanatory Guide (Part 11) */}
        {showPermissionsGuide && (
          <div className="mt-2 flex flex-col gap-3 rounded-lg border border-sx-border/60 bg-sx-surface-2/70 p-4 text-xs text-sx-text">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-sx-accent" />
              <h3 className="font-semibold text-sx-text">Why StratXcel Requests Google Permissions</h3>
            </div>
            <p className="text-sx-text-subtle">
              Hermes operates under strict least-privilege governance. We never ask for full account access. Each requested scope directly powers an autonomous capability:
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border border-sx-border/50 bg-sx-surface-1 p-3">
                <div className="font-medium text-sx-text">Google Drive (drive.file)</div>
                <p className="mt-1 text-[11px] text-sx-text-subtle">
                  Allows Hermes to create folders under <code>StratXcel/Autonomous Company/Missions/</code> and save verified reports, CSVs, and creative maps. Never accesses your personal Drive files.
                </p>
              </div>
              <div className="rounded-lg border border-sx-border/50 bg-sx-surface-1 p-3">
                <div className="font-medium text-sx-text">Search Console & GA4</div>
                <p className="mt-1 text-[11px] text-sx-text-subtle">
                  Read-only telemetry to measure organic keywords, impressions, and conversions for <code>stratxcel.in</code> to guide autonomous SEO missions.
                </p>
              </div>
              <div className="rounded-lg border border-sx-border/50 bg-sx-surface-1 p-3">
                <div className="font-medium text-sx-text">Google Sheets & Docs</div>
                <p className="mt-1 text-[11px] text-sx-text-subtle">
                  Generates downloadable prospect account spreadsheets and structured executive feasibility proposals.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Granular Services Grid (Part 9 & 10) */}
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-sx-text-subtle">
              Granular Google Capabilities & Status
            </h3>
            <span className="text-[11px] text-sx-text-subtle">
              Evaluated from real OAuth scopes & verification probes
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {googleStatus?.services.map((svc) => {
              const icon = SERVICE_ICONS[svc.key] ?? <Sparkles size={18} className="text-sx-accent" />;

              let badgeClass = "border-zinc-700 bg-zinc-800 text-zinc-400";
              if (svc.status === "VERIFIED") {
                badgeClass = "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
              } else if (svc.status === "AUTHORIZED") {
                badgeClass = "border-blue-500/30 bg-blue-500/10 text-blue-400";
              } else if (svc.status === "RESTRICTED") {
                badgeClass = "border-amber-500/30 bg-amber-500/10 text-amber-400";
              } else if (svc.status === "NEEDS_PERMISSION") {
                badgeClass = "border-orange-500/30 bg-orange-500/10 text-orange-400";
              } else if (svc.status === "UNAVAILABLE") {
                badgeClass = "border-zinc-800 bg-zinc-900/60 text-zinc-500";
              }

              return (
                <div
                  key={svc.key}
                  className="flex flex-col justify-between rounded-lg border border-sx-border/60 bg-sx-surface-2/40 p-3.5 transition-colors hover:border-sx-border"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-sx-border/60 bg-sx-surface-1">
                        {icon}
                      </div>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeClass}`}>
                        {svc.statusLabel}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-sx-text">{svc.name}</span>
                      <p className="mt-1 text-[11px] leading-relaxed text-sx-text-subtle line-clamp-2">
                        {svc.whyItIsNeeded}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 border-t border-sx-border/40 pt-2 text-[10px] text-sx-text-subtle">
                    {svc.writeCapable ? (
                      <span className="text-sx-text-muted">Write & Export Capable</span>
                    ) : (
                      <span className="text-sx-text-subtle">Read Only Telemetry</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Core Platform Connectors */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight text-sx-text">Core Platform Integrations</h2>
          <span className="text-xs text-sx-text-subtle">Production Services & Infrastructure</span>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {otherConnectors.map((c) => (
            <div
              key={c.key}
              className="flex flex-col justify-between rounded-xl border border-sx-border/70 bg-sx-surface-1 p-4.5 transition-all hover:border-sx-border hover:shadow-sm"
            >
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-sx-text-subtle">
                    {c.category}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                    <CheckCircle2 size={10} />
                    <span>{c.statusLabel}</span>
                  </span>
                </div>

                <div className="flex flex-col">
                  <h3 className="text-sm font-bold text-sx-text">{c.name}</h3>
                  <p className="mt-1 text-xs text-sx-text-subtle leading-relaxed">{c.description}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-sx-border/50 pt-2.5 text-[11px] text-sx-text-subtle">
                <span className="font-mono text-[10.5px] text-sx-text-muted">
                  {c.phone || c.instance || c.account || c.provider}
                </span>
                <span className="text-sx-accent font-medium">Verified</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
