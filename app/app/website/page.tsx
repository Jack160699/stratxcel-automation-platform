"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCurrentTenant } from "../CurrentTenantContext";
import { DisconnectedState } from "../components/DisconnectedState";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ErrorState } from "@/components/ui/Feedback";
import { WEBSITE_SERVICE_PACKAGES } from "@stratxcel/payments-and-wallet";
import dynamic from "next/dynamic";

const SmartWebsiteCreator = dynamic(
  () => import("@/components/site-builder/SmartWebsiteCreator").then((mod) => mod.SmartWebsiteCreator),
  { loading: () => <div className="p-6 text-center text-xs text-sx-text-subtle">Loading Website Creator…</div> }
);

const CustomerDomainManager = dynamic(
  () => import("@/components/site-builder/CustomerDomainManager").then((mod) => mod.CustomerDomainManager),
  { loading: () => <div className="p-4 text-xs text-sx-text-subtle">Loading domain settings…</div> }
);

interface WebsiteProject {
  id: string;
  name: string;
  slug: string;
  website_type: string;
  status: string;
  deployment_status: string;
  preview_subdomain: string;
  custom_domain?: string;
  production_url?: string;
  created_at: string;
}

export default function WebsitePage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;
  const businessName = active?.name || "Your Business";

  const [projects, setProjects] = useState<WebsiteProject[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit / Revision State
  const [editInstruction, setEditInstruction] = useState("");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editSuccessMessage, setEditSuccessMessage] = useState<string | null>(null);

  async function loadData() {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/website-factory?tenantId=${encodeURIComponent(tenantId)}`);
      if (res.ok) {
        const body = await res.json();
        setProjects(body.projects || []);
      } else {
        setProjects([]);
      }
    } catch {
      setError("Unable to load website information right now.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function handleApplyEdit(projectId: string) {
    if (!tenantId || !editInstruction.trim()) return;

    setEditingProjectId(projectId);
    setError(null);
    setEditSuccessMessage(null);
    try {
      const res = await fetch(`/api/platform/website-factory/${projectId}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          instruction: editInstruction.trim(),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Failed to apply website revision");
        return;
      }
      setEditInstruction("");
      setEditSuccessMessage("Website update applied successfully!");
      setTimeout(() => setEditSuccessMessage(null), 4000);
      await loadData();
    } catch {
      setError("Network error while updating website");
    } finally {
      setEditingProjectId(null);
    }
  }

  const primaryProject = projects?.[0] || null;
  const isLive = primaryProject?.status === "live" || primaryProject?.deployment_status === "LIVE";
  const currentDomain = primaryProject?.custom_domain || (primaryProject?.slug ? `${primaryProject.slug}.stratxcel.site` : `${businessName.toLowerCase().replace(/[^a-z0-9]/g, "")}.stratxcel.site`);

  return (
    <div className="sx-customer-app mx-auto flex w-full max-w-[800px] flex-col gap-6 pb-20 md:pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-sx-text">Website & Domains</h1>
          <p className="mt-0.5 text-xs text-sx-text-muted">
            Manage your live business website, domain connection, and professional website creation for {businessName}
          </p>
        </div>
        <Link
          href="/app/website/create"
          className="inline-flex h-9 items-center justify-center rounded-sx-sm bg-sx-accent px-4 text-xs font-bold text-sx-accent-on hover:bg-sx-accent/90 transition-colors shadow-xs"
        >
          + Create Website
        </Link>
      </div>

      {error && <ErrorState message={error} onRetry={loadData} />}

      {/* SECTION 1: YOUR WEBSITE */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-sx-text-subtle">Your Website</h2>

        {loading ? (
          <div className="rounded-sx-lg border border-sx-border bg-sx-surface-1 p-6 text-center text-xs text-sx-text-subtle">
            Loading website status…
          </div>
        ) : primaryProject ? (
          <Card className="overflow-hidden p-0">
            <div className="bg-gradient-to-br from-sx-accent-muted via-sx-surface-1 to-sx-surface-2 p-5 sm:p-6 border-b border-sx-border">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sx-md bg-sx-surface-1 shadow-sm border border-sx-border text-2xl">
                    🌐
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${isLive ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
                      <span className={`text-xs font-bold ${isLive ? "text-emerald-500" : "text-amber-500"}`}>
                        {isLive ? "Connected & Live" : "Website Preview Ready"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-base sm:text-lg font-bold text-sx-text">{currentDomain}</p>
                    <p className="text-[11px] text-sx-text-muted">Created on {new Date(primaryProject.created_at).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`/app/website/${primaryProject.id}/preview`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center justify-center rounded-sx-sm border border-sx-border bg-sx-surface-1 px-3.5 text-xs font-bold text-sx-text hover:bg-sx-surface-2 transition-colors"
                  >
                    Preview ↗
                  </a>
                  <a
                    href={primaryProject.production_url || `https://${currentDomain}`}
                    target={isLive ? "_blank" : undefined}
                    rel="noreferrer"
                    className={`inline-flex h-9 items-center justify-center rounded-sx-sm px-4 text-xs font-bold transition-opacity ${
                      isLive ? "bg-sx-accent text-sx-accent-on hover:bg-sx-accent/90" : "bg-sx-surface-3 text-sx-text-subtle cursor-not-allowed"
                    }`}
                  >
                    Open Website 🌐
                  </a>
                </div>
              </div>
            </div>

            {/* Quick Website Update */}
            <div className="p-4 sm:p-5">
              <label htmlFor="website-edit-input" className="block text-xs font-bold text-sx-text mb-1.5">
                Update your website with AI:
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  id="website-edit-input"
                  value={editInstruction}
                  onChange={(e) => setEditInstruction(e.target.value)}
                  placeholder="e.g. 'Add festival discounts', 'Update business hours', 'Add photo gallery'..."
                  className="flex-1 text-xs"
                />
                <Button
                  size="sm"
                  variant="primary"
                  disabled={editingProjectId === primaryProject.id || !editInstruction.trim()}
                  onClick={() => handleApplyEdit(primaryProject.id)}
                >
                  {editingProjectId === primaryProject.id ? "Updating…" : "Apply Update 🪄"}
                </Button>
              </div>
              {editSuccessMessage && (
                <p className="mt-2 text-xs font-semibold text-emerald-500">{editSuccessMessage}</p>
              )}
            </div>
          </Card>
        ) : (
          <div className="rounded-sx-lg border border-dashed border-sx-border bg-sx-surface-1 p-6 text-center">
            <span className="text-3xl mb-2 inline-block">🌐</span>
            <h3 className="text-base font-bold text-sx-text">You don&apos;t have a website yet</h3>
            <p className="mt-1 max-w-md mx-auto text-xs text-sx-text-muted">
              Get a professional website for your business, built around your shop, services, photos, and brand identity.
            </p>
            <Link
              href="/app/website/create"
              className="mt-4 inline-flex h-9 items-center justify-center rounded-sx-sm bg-sx-accent px-4 text-xs font-bold text-sx-accent-on hover:bg-sx-accent/90 transition-colors"
            >
              Create Website →
            </Link>
          </div>
        )}
      </section>

      {/* SECTION 2: CREATE A WEBSITE / SERVICE PROMOTION */}
      <section className="rounded-sx-lg border border-sx-accent/30 bg-gradient-to-r from-sx-accent-muted/40 via-sx-surface-1 to-sx-surface-1 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <span className="rounded-full bg-sx-accent/15 px-2.5 py-0.5 text-[10px] font-bold text-sx-accent uppercase tracking-wider">
              Website Factory
            </span>
            <h3 className="mt-1.5 text-base font-bold text-sx-text">Need a high-converting website?</h3>
            <p className="mt-0.5 text-xs text-sx-text-muted">
              We create custom, high-speed websites tailored specifically for local businesses — from single landing pages to complete multi-page sites.
            </p>
          </div>
          <Link
            href="/app/website/create"
            className="inline-flex h-9 items-center justify-center rounded-sx-sm bg-sx-accent px-4 text-xs font-bold text-sx-accent-on hover:bg-sx-accent/90 transition-colors shrink-0"
          >
            Launch Website Factory →
          </Link>
        </div>
      </section>

      {/* SECTION 3: YOUR DOMAIN */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-sx-text-subtle">Your Domain</h2>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-sx-text-muted">Connected Domain Address</p>
              <p className="text-base font-bold text-sx-text mt-0.5">{currentDomain}</p>
            </div>
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-500">
              {primaryProject?.custom_domain ? "Custom Domain Connected" : "Included Subdomain"}
            </span>
          </div>

          {tenantId && primaryProject && (
            <div className="mt-4 border-t border-sx-border pt-4">
              <CustomerDomainManager
                tenantId={tenantId}
                projectId={primaryProject.id}
                projectName={primaryProject.name}
                existingDomain={primaryProject.custom_domain}
                onDomainUpdated={() => loadData()}
              />
            </div>
          )}
        </Card>
      </section>

      {/* SECTION 4: WEBSITE PLANS & SERVICES (10x PRICING) */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-sx-text-subtle">Website Plans & Services</h2>
          <p className="text-xs text-sx-text-muted">
            Your StratXcel SaaS subscription controls marketing & growth features. Website creation services are separately priced professional website packages.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {Object.values(WEBSITE_SERVICE_PACKAGES).map((pkg) => (
            <div
              key={pkg.id}
              className="flex flex-col justify-between rounded-sx-lg border border-sx-border bg-sx-surface-1 p-5 transition-all hover:border-sx-accent/50 hover:shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-sx-text">{pkg.name}</h3>
                  {pkg.id === "five_page" && (
                    <span className="rounded-full bg-sx-accent/15 px-2 py-0.5 text-[10px] font-bold text-sx-accent">
                      Recommended
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-sx-text-muted line-clamp-2">{pkg.shortDescription}</p>

                <div className="mt-3.5 flex items-baseline gap-1">
                  <span className="text-xl font-bold text-sx-text">₹{pkg.priceInr.toLocaleString("en-IN")}</span>
                  <span className="text-[10px] text-sx-text-subtle">/ package</span>
                </div>
                <p className="text-[10px] text-sx-text-muted">Turnaround: {pkg.turnaroundDays}</p>

                <div className="mt-3.5 border-t border-sx-border/60 pt-2.5 space-y-1 text-[11px] text-sx-text">
                  {pkg.includedFeatures.slice(0, 4).map((f, idx) => (
                    <div key={idx} className="flex items-start gap-1">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span className="line-clamp-1">{f}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Link
                href={`/app/website/create?package=${pkg.id}`}
                className="mt-4 block w-full rounded-sx-sm bg-sx-accent py-2 text-center text-xs font-bold text-sx-accent-on hover:bg-sx-accent/90 transition-colors"
              >
                {pkg.ctaLabel}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Inactive State Helper */}
      {!isLive && primaryProject && (
        <div className="hidden">
          <DisconnectedState title="Website Preview" />
        </div>
      )}

      <p className="px-1 text-[11px] text-sx-text-subtle">
        Production promotion requires approval — publishing always requires your explicit approval, verified payment confirmation, and passing automated QA checks.
      </p>
    </div>
  );
}
