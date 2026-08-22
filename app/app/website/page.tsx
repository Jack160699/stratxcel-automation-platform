"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCurrentTenant } from "../CurrentTenantContext";
import { DisconnectedState } from "../components/DisconnectedState";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ErrorState } from "@/components/ui/Feedback";
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
  prompt?: string;
  pages?: Array<{ id: string; title: string; slug: string }>;
  created_at: string;
  website_agents?: Array<{ id: string; name: string; enabled: boolean; conversation_count: number }>;
}

export default function WebsitePage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;
  const businessName = active?.name || "Your Business";

  const [projects, setProjects] = useState<WebsiteProject[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<string>("free");

  // Creation State
  const [showSmartCreator, setShowSmartCreator] = useState(false);

  // Edit / Revision State
  const [editInstruction, setEditInstruction] = useState("");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editSuccessMessage, setEditSuccessMessage] = useState<string | null>(null);

  // Active Tab View: "overview" | "domain" | "plans"
  const [activeTab, setActiveTab] = useState<"overview" | "domain" | "plans">("overview");

  async function loadData() {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [projRes, subRes] = await Promise.all([
        fetch(`/api/platform/website-factory?tenantId=${encodeURIComponent(tenantId)}`).catch(() => null),
        fetch(`/api/platform/subscriptions?tenantId=${encodeURIComponent(tenantId)}`).catch(() => null),
      ]);

      if (projRes && projRes.ok) {
        const body = await projRes.json();
        setProjects(body.projects || []);
      } else {
        setProjects([]);
      }

      if (subRes && subRes.ok) {
        const subBody = await subRes.json();
        if (subBody.subscription?.plan_tier) {
          setActivePlan(subBody.subscription.plan_tier);
        }
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
          <h1 className="text-2xl font-bold tracking-tight text-sx-text">Website & Domain</h1>
          <p className="mt-0.5 text-xs text-sx-text-muted">
            Manage your live business website, domain connection, and hosting for {businessName}
          </p>
        </div>
        {tenantId && projects && projects.length > 0 && (
          <Button variant="primary" size="sm" onClick={() => setShowSmartCreator(true)}>
            + Create New Website
          </Button>
        )}
      </div>

      {error && <ErrorState message={error} onRetry={loadData} />}

      {/* Plan & Capabilities Banner */}
      <div className="rounded-sx-lg border border-sx-border bg-sx-surface-1 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sx-md bg-sx-accent-muted text-lg font-bold text-sx-accent">
              🌐
            </span>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-sx-text-muted uppercase tracking-wider">Your Plan</p>
                <span className="rounded-full bg-sx-accent/15 px-2 py-0.5 text-[11px] font-bold text-sx-accent uppercase">
                  {activePlan}
                </span>
              </div>
              <p className="text-sm font-bold text-sx-text mt-0.5">
                {activePlan === "free" ? "Free Website & Live Subdomain" : "Custom Domain & Priority Hosting"}
              </p>
            </div>
          </div>
          {activePlan === "free" ? (
            <Link
              href="/app/billing"
              className="inline-flex h-9 items-center justify-center rounded-sx-sm bg-sx-accent px-4 text-xs font-bold text-sx-accent-on hover:bg-sx-accent/90 transition-colors shrink-0"
            >
              Connect Custom Domain →
            </Link>
          ) : (
            <Link
              href="/app/billing"
              className="inline-flex h-9 items-center justify-center rounded-sx-sm border border-sx-border bg-sx-surface-2 px-3.5 text-xs font-semibold text-sx-text hover:bg-sx-surface-3 transition-colors shrink-0"
            >
              Manage Plan
            </Link>
          )}
        </div>

        <div className="mt-3.5 grid gap-2 pt-3 border-t border-sx-border sm:grid-cols-2 text-xs">
          <div className="flex items-center gap-2 text-sx-text">
            <span className="text-emerald-500 font-bold">✓</span>
            <span>Live mobile website preview with WhatsApp contact link</span>
          </div>
          <div className="flex items-center gap-2 text-sx-text">
            <span className="text-emerald-500 font-bold">✓</span>
            <span>Clean SSL-secured <code className="bg-sx-surface-2 px-1 py-0.5 rounded text-[11px]">.stratxcel.site</code> address</span>
          </div>
          <div className="flex items-center gap-2 text-sx-text-muted">
            <span className={activePlan !== "free" ? "text-emerald-500 font-bold" : "text-sx-text-subtle"}>
              {activePlan !== "free" ? "✓" : "•"}
            </span>
            <span>Custom domain (<code className="bg-sx-surface-2 px-1 py-0.5 rounded text-[11px]">yourbusiness.com</code>) {activePlan === "free" && "(Growth Plan)"}</span>
          </div>
          <div className="flex items-center gap-2 text-sx-text-muted">
            <span className={activePlan !== "free" ? "text-emerald-500 font-bold" : "text-sx-text-subtle"}>
              {activePlan !== "free" ? "✓" : "•"}
            </span>
            <span>AI natural-language website revisions & SEO metadata</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs: My Website | My Domain | Plan Details */}
      <div className="flex items-center gap-1.5 border-b border-sx-border pb-1">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`rounded-sx-sm px-3.5 py-1.5 text-xs font-bold transition-colors ${
            activeTab === "overview"
              ? "bg-sx-accent text-sx-accent-on"
              : "text-sx-text-muted hover:bg-sx-surface-2 hover:text-sx-text"
          }`}
        >
          My Website
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("domain")}
          className={`rounded-sx-sm px-3.5 py-1.5 text-xs font-bold transition-colors ${
            activeTab === "domain"
              ? "bg-sx-accent text-sx-accent-on"
              : "text-sx-text-muted hover:bg-sx-surface-2 hover:text-sx-text"
          }`}
        >
          My Domain
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("plans")}
          className={`rounded-sx-sm px-3.5 py-1.5 text-xs font-bold transition-colors ${
            activeTab === "plans"
              ? "bg-sx-accent text-sx-accent-on"
              : "text-sx-text-muted hover:bg-sx-surface-2 hover:text-sx-text"
          }`}
        >
          Plan Comparison
        </button>
      </div>

      {/* Smart Website Creator Flow */}
      {(showSmartCreator || (!loading && (!projects || projects.length === 0))) && tenantId && (
        <Card className="p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between border-b border-sx-border pb-3">
            <div>
              <h2 className="text-base font-bold text-sx-text">Smart Website Creator</h2>
              <p className="text-xs text-sx-text-muted">Tell us about your business in English, Hindi, or Hinglish. StratXcel builds your complete website automatically.</p>
            </div>
            {projects && projects.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setShowSmartCreator(false)}>
                ✕ Close
              </Button>
            )}
          </div>
          <SmartWebsiteCreator
            tenantId={tenantId}
            onClose={() => {
              setShowSmartCreator(false);
              loadData();
            }}
            onPublish={async () => {
              setShowSmartCreator(false);
              await loadData();
            }}
          />
        </Card>
      )}

      {/* TAB 1: MY WEBSITE OVERVIEW */}
      {activeTab === "overview" && (
        <div className="flex flex-col gap-5">
          {loading && <p className="text-sm text-sx-text-subtle">Loading website details…</p>}

          {!loading && (!projects || projects.length === 0) && (
            <div className="rounded-sx-lg border border-dashed border-sx-border bg-sx-surface-1 p-8 text-center">
              <span className="text-4xl mb-2">🌐</span>
              <p className="text-base font-bold text-sx-text">No Website Created Yet</p>
              <p className="mt-1 max-w-md mx-auto text-xs text-sx-text-muted">
                Create a high-converting mobile website with your services, hours, photos, and WhatsApp ordering button.
              </p>
              <button
                type="button"
                onClick={() => setShowSmartCreator(true)}
                className="mt-4 rounded-sx-sm bg-sx-accent px-4 py-2 text-xs font-bold text-sx-accent-on hover:bg-sx-accent/90"
              >
                Launch Smart Website Creator →
              </button>
            </div>
          )}

          {primaryProject && (
            <div className="flex flex-col gap-4">
              {/* Main Website Hero Card */}
              <Card className="overflow-hidden p-0">
                <div className="bg-gradient-to-br from-sx-accent-muted via-sx-surface-1 to-sx-surface-2 p-6 sm:p-8 text-center border-b border-sx-border">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-sx-md bg-sx-surface-1 shadow-sm border border-sx-border">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--sx-accent)" strokeWidth="2">
                      <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
                    </svg>
                  </div>
                  <h2 className="mt-3 text-lg sm:text-xl font-bold text-sx-text">{currentDomain}</h2>
                  <div className="mt-1.5 flex items-center justify-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${isLive ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
                    <span className={`text-xs font-bold ${isLive ? "text-emerald-500" : "text-amber-500"}`}>
                      {isLive ? "Your Website is Live" : "Draft Website Ready"}
                    </span>
                    <span className="text-xs text-sx-text-subtle">• Created {new Date(primaryProject.created_at).toLocaleDateString()}</span>
                  </div>

                  <div className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-2.5 max-w-md mx-auto">
                    <a
                      href={`/app/website/${primaryProject.id}/preview`}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full sm:w-auto flex-1 rounded-sx-sm border border-sx-border bg-sx-surface-1 px-4 py-2.5 text-center text-xs font-bold text-sx-text hover:bg-sx-surface-2 transition-colors"
                    >
                      Open Live Preview ↗
                    </a>
                    <a
                      href={primaryProject.production_url || `https://${currentDomain}`}
                      target={isLive ? "_blank" : undefined}
                      rel="noreferrer"
                      className={`w-full sm:w-auto flex-1 rounded-sx-sm px-4 py-2.5 text-center text-xs font-bold transition-opacity ${
                        isLive ? "bg-sx-accent text-sx-accent-on hover:bg-sx-accent/90" : "bg-sx-surface-3 text-sx-text-subtle cursor-not-allowed"
                      }`}
                    >
                      Visit Live Website 🌐
                    </a>
                  </div>
                </div>

                {/* Quick Edit Prompts */}
                <div className="p-4 sm:p-5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-sx-text-subtle mb-2">
                    Quick Website Improvements
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { label: "📸 Add Photo Gallery", prompt: "Add a modern photo gallery section showcasing our latest products and shop interior" },
                      { label: "⏰ Update Operating Hours", prompt: "Update the weekly business hours and holiday schedule on the website" },
                      { label: "📋 Edit Menu & Service Prices", prompt: "Update our core service catalog, price list, and special discounts" },
                      { label: "💬 Update WhatsApp Button", prompt: "Highlight our WhatsApp ordering button with an attractive call-to-action" },
                    ].map((action) => (
                      <button
                        key={action.label}
                        type="button"
                        onClick={() => {
                          setEditingProjectId(primaryProject.id);
                          setEditInstruction(action.prompt);
                        }}
                        className="flex items-center justify-between rounded-sx-sm border border-sx-border bg-sx-surface-2 p-2.5 text-left transition-colors hover:border-sx-accent/40"
                      >
                        <span className="text-xs font-semibold text-sx-text">{action.label}</span>
                        <span className="text-xs text-sx-accent">→</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* AI Natural Language Revision Input */}
                <div className="p-4 sm:p-5 pt-0">
                  <div className="rounded-sx-md border border-sx-border bg-sx-surface-2 p-3.5">
                    <label htmlFor="website-edit-input" className="block text-xs font-bold text-sx-text mb-1.5">
                      Tell StratXcel what to update on your website:
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        id="website-edit-input"
                        value={editInstruction}
                        onChange={(e) => setEditInstruction(e.target.value)}
                        placeholder="e.g. 'Make hero banner more premium', 'Add customer testimonials'..."
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
                </div>
              </Card>

              {/* Status Grid */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-3.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-sx-text-subtle">Domain Status</p>
                  <p className="mt-1 text-sm font-bold text-sx-text truncate">{currentDomain}</p>
                  <p className="mt-0.5 text-xs text-emerald-500 font-semibold">Active & Routing</p>
                </div>
                <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-3.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-sx-text-subtle">Security & SSL</p>
                  <p className="mt-1 text-sm font-bold text-sx-text">HTTPS Encrypted</p>
                  <p className="mt-0.5 text-xs text-emerald-500 font-semibold">Automated Certificate</p>
                </div>
                <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-3.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-sx-text-subtle">Mobile Optimization</p>
                  <p className="mt-1 text-sm font-bold text-sx-text">Fast Mobile Layout</p>
                  <p className="mt-0.5 text-xs text-emerald-500 font-semibold">100% Responsive</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MY DOMAIN MANAGEMENT */}
      {activeTab === "domain" && (
        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <h2 className="text-base font-bold text-sx-text">Domain Connection & Settings</h2>
            <p className="mt-0.5 text-xs text-sx-text-muted">
              Connect your own custom domain (e.g. <code className="bg-sx-surface-2 px-1 rounded text-[11px]">yourbusiness.com</code>) or manage your default subdomain.
            </p>

            <div className="mt-4 rounded-sx-md border border-sx-border bg-sx-surface-2 p-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-sx-text-subtle">Current Active Address</p>
                  <p className="text-sm font-bold text-sx-text mt-0.5">{currentDomain}</p>
                </div>
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-500">
                  {primaryProject?.custom_domain ? "Custom Domain" : "Included Subdomain"}
                </span>
              </div>
            </div>

            {tenantId && primaryProject && (
              <div className="mt-4">
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

          {/* Simple Guidance */}
          <div className="rounded-sx-lg border border-sx-border bg-sx-surface-1 p-5">
            <h3 className="text-sm font-bold text-sx-text mb-2">Common Domain Questions</h3>
            <div className="space-y-3 text-xs text-sx-text">
              <div>
                <p className="font-semibold text-sx-text">• How long does domain connection take?</p>
                <p className="text-sx-text-muted mt-0.5">Most domains connect and verify within 10 to 30 minutes once you add the DNS records.</p>
              </div>
              <div>
                <p className="font-semibold text-sx-text">• Can I keep my existing domain registrar (GoDaddy, Namecheap, Hostinger)?</p>
                <p className="text-sx-text-muted mt-0.5">Yes! You don&apos;t need to transfer your domain. Simply point your CNAME record to StratXcel.</p>
              </div>
              <div>
                <p className="font-semibold text-sx-text">• Is SSL security included?</p>
                <p className="text-sx-text-muted mt-0.5">Yes, automated SSL certificates are provisioned and renewed automatically at zero extra cost.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PLAN COMPARISON */}
      {activeTab === "plans" && (
        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <h2 className="text-base font-bold text-sx-text">Website & Domain Capabilities by Plan</h2>
            <p className="mt-0.5 text-xs text-sx-text-muted">
              Choose the right tier for your local business presence.
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-sx-border text-sx-text-subtle uppercase text-[10px] tracking-wider">
                    <th className="py-2.5 pr-4">Feature</th>
                    <th className="py-2.5 px-3">Free</th>
                    <th className="py-2.5 px-3 text-sx-accent">Growth (₹9,999/mo)</th>
                    <th className="py-2.5 pl-3">Business (₹19,999/mo)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sx-border/60 text-sx-text">
                  <tr>
                    <td className="py-2.5 pr-4 font-semibold">Mobile Website</td>
                    <td className="py-2.5 px-3 text-emerald-500">✓ Included</td>
                    <td className="py-2.5 px-3 text-emerald-500 font-bold">✓ Included</td>
                    <td className="py-2.5 pl-3 text-emerald-500">✓ Included</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-semibold">Subdomain (.stratxcel.site)</td>
                    <td className="py-2.5 px-3 text-emerald-500">✓ Included</td>
                    <td className="py-2.5 px-3 text-emerald-500 font-bold">✓ Included</td>
                    <td className="py-2.5 pl-3 text-emerald-500">✓ Included</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-semibold">Custom Domain Connection</td>
                    <td className="py-2.5 px-3 text-sx-text-subtle">—</td>
                    <td className="py-2.5 px-3 text-emerald-500 font-bold">✓ Included</td>
                    <td className="py-2.5 pl-3 text-emerald-500">✓ Included</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-semibold">AI Natural Language Revisions</td>
                    <td className="py-2.5 px-3 text-sx-text-muted">Basic</td>
                    <td className="py-2.5 px-3 text-emerald-500 font-bold">✓ Unlimited</td>
                    <td className="py-2.5 pl-3 text-emerald-500">✓ Priority AI</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-semibold">Automated Social Publishing</td>
                    <td className="py-2.5 px-3 text-sx-text-subtle">Manual draft</td>
                    <td className="py-2.5 px-3 text-emerald-500 font-bold">25 posts/mo</td>
                    <td className="py-2.5 pl-3 text-emerald-500">50 posts/mo</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex justify-end">
              <Link
                href="/app/billing"
                className="inline-flex h-9 items-center justify-center rounded-sx-sm bg-sx-accent px-4 text-xs font-bold text-sx-accent-on hover:bg-sx-accent/90 transition-colors"
              >
                View Full Pricing & Upgrade →
              </Link>
            </div>
          </Card>
        </div>
      )}

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
