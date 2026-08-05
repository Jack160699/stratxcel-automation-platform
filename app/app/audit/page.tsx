"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AuthenticatedAuditPage() {
  const router = useRouter();

  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [goals, setGoals] = useState("Automate WhatsApp lead follow-up & social content");
  const [contactPhone, setContactPhone] = useState("");

  const [resolvingSite, setResolvingSite] = useState(false);
  const [siteResolvedMessage, setSiteResolvedMessage] = useState<string | null>(null);

  const [brandBrainReady, setBrandBrainReady] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch user's Brand Brain profile to pre-fill information
    async function loadBrandBrain() {
      try {
        const res = await fetch("/api/platform/brand");
        if (res.ok) {
          const data = await res.json();
          if (data.brandBrain) {
            setBusinessName(data.brandBrain.business_name ?? "");
            setIndustry(data.brandBrain.industry ?? "");
            if (data.brandBrain.website_url) setWebsiteUrl(data.brandBrain.website_url);
          }
        }
      } catch {
        // Silently proceed
      }
    }
    loadBrandBrain();
  }, []);

  const handleResolveWebsite = async () => {
    if (!websiteUrl.trim()) return;
    setResolvingSite(true);
    setSiteResolvedMessage(null);

    try {
      const res = await fetch("/api/platform/site-discovery/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: websiteUrl.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.normalizedUrl) {
        setWebsiteUrl(data.normalizedUrl);
        setSiteResolvedMessage(`Verified: ${data.title || data.normalizedUrl}`);
      }
    } catch {
      // Keep user input
    } finally {
      setResolvingSite(false);
    }
  };

  const handleStartAudit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!businessName.trim()) {
      setError("Please enter your business or brand name.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/platform/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: businessName.trim(),
          industry: industry.trim() || undefined,
          websiteUrl: websiteUrl.trim() || undefined,
          goals: goals.trim() || undefined,
          contactPhone: contactPhone.trim() || undefined,
          auditAnswers: {
            businessProfile: { businessName, industry, websiteUrl },
            goals: { primaryGoal: goals },
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to trigger AI audit. Please try again.");
        return;
      }

      if (data.auditId) {
        router.push(`/app/audit/${data.auditId}`);
      }
    } catch {
      setError("Network error starting audit. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="border-b border-slate-200 pb-6">
        <span className="font-sx-mono text-xs font-bold uppercase tracking-wider text-sx-accent">
          Stratxcel AI Business Audit
        </span>
        <h1 className="mt-2 font-sx-sans text-2xl sm:text-3xl font-extrabold text-slate-900">
          Start Your Personalised AI Growth Audit
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Our AI engine reviews your Brand Brain, website, competitor positioning, and lead channels to produce an evidence-based 30/60/90-day growth plan.
        </p>
      </div>

      {/* Brand Brain Prerequisite Banner */}
      {!brandBrainReady && (
        <div className="mt-6 rounded-sx-md border border-amber-300 bg-amber-50 p-4 text-amber-900 text-xs flex items-center justify-between">
          <div>
            <strong>💡 Brand Brain Requirement:</strong> Please complete your Brand Brain core details to ensure accurate audit recommendations.
          </div>
          <Link
            href="/app/brand"
            className="rounded-sx-sm bg-amber-900 px-3 py-1.5 font-bold text-white text-[11px] hover:bg-amber-800 shrink-0 ml-4"
          >
            Setup Brand Brain →
          </Link>
        </div>
      )}

      {/* Audit Trigger Form */}
      <form onSubmit={handleStartAudit} className="mt-8 rounded-sx-lg border border-slate-200 bg-white p-6 sm:p-8 shadow-sm space-y-6">
        {error && (
          <div className="rounded-sx-sm border border-red-300 bg-red-50 p-3.5 text-xs font-semibold text-red-800">
            {error}
          </div>
        )}

        <div>
          <label className="block font-sx-sans text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
            Business or Brand Name *
          </label>
          <input
            type="text"
            required
            placeholder="e.g. Apex Fitness Studio"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className="w-full rounded-sx-sm border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-sx-accent focus:bg-white focus:outline-none"
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label className="block font-sx-sans text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              Industry / Sector
            </label>
            <input
              type="text"
              placeholder="e.g. Healthcare, Fitness, E-commerce"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full rounded-sx-sm border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-sx-accent focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-sx-sans text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              WhatsApp / Phone Number
            </label>
            <input
              type="tel"
              placeholder="+91 98765 43210"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="w-full rounded-sx-sm border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-sx-accent focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        {/* Website Field with Site Discovery Resolver */}
        <div>
          <label className="block font-sx-sans text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
            Website URL (Intelligent Resolver)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. jandarpan.news or https://example.com"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              onBlur={handleResolveWebsite}
              className="flex-1 rounded-sx-sm border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-sx-accent focus:bg-white focus:outline-none"
            />
            <button
              type="button"
              onClick={handleResolveWebsite}
              disabled={resolvingSite}
              className="rounded-sx-sm border border-slate-300 bg-slate-100 px-4 py-2.5 font-sx-sans text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
            >
              {resolvingSite ? "Resolving..." : "Verify Domain"}
            </button>
          </div>
          {siteResolvedMessage && (
            <p className="mt-1.5 text-xs text-emerald-700 font-medium">✓ {siteResolvedMessage}</p>
          )}
        </div>

        <div>
          <label className="block font-sx-sans text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
            Primary Growth Objective
          </label>
          <select
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            className="w-full rounded-sx-sm border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-sx-accent focus:bg-white focus:outline-none"
          >
            <option value="Automate WhatsApp lead follow-up & social content">Automate WhatsApp lead follow-up & social content</option>
            <option value="Launch a new high-converting 5-page website">Launch a new high-converting 5-page website</option>
            <option value="Scale Meta ad campaign workflows & lead pipeline">Scale Meta ad campaign workflows & lead pipeline</option>
            <option value="Full AI operating system (Content + Website + CRM + Ads)">Full AI operating system (Content + Website + CRM + Ads)</option>
          </select>
        </div>

        <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            ⚡ Asynchronous Research: Audits run in background & generate structured report.
          </p>
          <button
            type="submit"
            disabled={loading}
            className="rounded-sx-sm bg-sx-accent px-8 py-3 font-sx-sans text-xs font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Queuing Audit Job..." : "Start AI Business Audit →"}
          </button>
        </div>
      </form>
    </div>
  );
}
