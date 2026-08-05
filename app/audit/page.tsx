"use client";

import { useState } from "react";
import Link from "next/link";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";

export default function AuditPage() {
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [goals, setGoals] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{ paymentUrl?: string; leadId?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim() || !contactEmail.trim()) {
      setError("Please enter your Business Name and Contact Email");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Option B — Safe consultation & onboarding flow (no exposed demo tenant)
      const res = await fetch("/api/platform/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "audit_page",
          businessName,
          industry,
          websiteUrl,
          contactEmail,
          contactPhone,
          goals,
          requestedProduct: "audit_fee",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to submit audit request");
        return;
      }

      setSuccessData({ leadId: data.id ?? "submitted" });
    } catch {
      setError("Network error submitting audit request. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-sx-bg text-sx-text">
      <PublicHeader />
      <main className="flex-1 py-16 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          {/* Header */}
          <div className="text-center">
            <span className="inline-block rounded-sx-pill border border-sx-accent/40 bg-sx-accent/10 px-3.5 py-1 font-sx-mono text-[11px] font-semibold uppercase tracking-widest text-sx-accent">
              Initial Growth Step
            </span>
            <h1 className="mt-4 font-sx-sans text-3xl font-extrabold tracking-tight sm:text-4xl text-sx-text">
              Book Your Business Growth Audit (₹999)
            </h1>
            <p className="mt-3 font-sx-sans text-base text-sx-text-muted sm:text-lg">
              Receive a deep-dive analysis of your brand, competitors, lead channels, and social media presence.
            </p>
          </div>

          {/* 7-Day Credit Callout Banner */}
          <div className="mt-8 rounded-sx-lg border border-sx-accent/30 bg-gradient-to-r from-sx-accent/10 via-sx-surface-2 to-purple-950/20 p-6 text-center shadow-lg">
            <p className="font-sx-sans text-sm font-semibold text-sx-accent">
              💡 100% Fee Guarantee: The full ₹999 audit fee is adjusted against your first qualifying Launch or Growth subscription if purchased within 7 days of completion.
            </p>
          </div>

          {/* Audit Highlights */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4">
              <h3 className="font-sx-sans font-semibold text-sx-accent text-sm">1. Brand & Competitor Audit</h3>
              <p className="mt-1 font-sx-sans text-xs text-sx-text-muted">Positioning snapshot, competitor benchmarks, and messaging opportunities.</p>
            </div>
            <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4">
              <h3 className="font-sx-sans font-semibold text-sx-accent text-sm">2. Social & Channel Review</h3>
              <p className="mt-1 font-sx-sans text-xs text-sx-text-muted">Analysis of active social pages, ad accounts, website performance, and lead flow.</p>
            </div>
            <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4">
              <h3 className="font-sx-sans font-semibold text-sx-accent text-sm">3. Actionable Growth Plan</h3>
              <p className="mt-1 font-sx-sans text-xs text-sx-text-muted">Step-by-step roadmap for content, WhatsApp workflows, and Meta campaigns.</p>
            </div>
            <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4">
              <h3 className="font-sx-sans font-semibold text-sx-accent text-sm">4. Brand Brain Starter</h3>
              <p className="mt-1 font-sx-sans text-xs text-sx-text-muted">Initial AI Brand Brain profile created directly inside your Stratxcel OS workspace.</p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-10 rounded-sx-lg border border-sx-border bg-sx-surface-1 p-6 sm:p-8 shadow-xl">
            <h2 className="font-sx-sans text-xl font-bold text-sx-text mb-6">Enter Business Information</h2>

            {error && (
              <div className="mb-6 rounded-sx-md border border-red-500/50 bg-red-950/40 p-4 text-xs font-semibold text-red-300">
                {error}
              </div>
            )}

            {successData && (
              <div className="mb-6 rounded-sx-md border border-emerald-500/50 bg-emerald-950/40 p-4 text-xs font-semibold text-emerald-300">
                Thank you! Your audit request has been received. Our team will contact you on WhatsApp / email to confirm payment and deliver your report.
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                  Business / Brand Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Fitness Studio"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-3 text-sm text-sx-text placeholder-sx-text-subtle focus:border-sx-accent focus:outline-none"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                    Contact Email *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="john@example.com"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-3 text-sm text-sx-text placeholder-sx-text-subtle focus:border-sx-accent focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                    Phone / WhatsApp Number
                  </label>
                  <input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-3 text-sm text-sx-text placeholder-sx-text-subtle focus:border-sx-accent focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                    Industry / Sector
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Healthcare, Retail, Real Estate"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-3 text-sm text-sx-text placeholder-sx-text-subtle focus:border-sx-accent focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                    Website URL (Optional)
                  </label>
                  <input
                    type="url"
                    placeholder="https://example.com"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-3 text-sm text-sx-text placeholder-sx-text-subtle focus:border-sx-accent focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                  Primary Growth Goals
                </label>
                <textarea
                  rows={3}
                  placeholder="Describe what you want to achieve (e.g. more local WhatsApp leads, better Instagram content, website overhaul)..."
                  value={goals}
                  onChange={(e) => setGoals(e.target.value)}
                  className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-3 text-sm text-sx-text placeholder-sx-text-subtle focus:border-sx-accent focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-8">
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-sx-sm bg-sx-accent py-3.5 font-sx-sans text-sm font-bold text-sx-accent-on shadow-lg transition-colors hover:bg-[color:var(--sx-accent-hover)] disabled:opacity-50"
              >
                {loading ? "Submitting Audit Request..." : "Request Business Growth Audit (₹999)"}
              </button>
            </div>
            <p className="mt-3 text-center font-sx-sans text-xs text-sx-text-subtle">
              Includes GST invoice metadata and 7-day subscription credit eligibility.
            </p>
          </form>

          <div className="mt-8 text-center">
            <Link href="/pricing" className="font-sx-sans text-xs text-sx-accent underline hover:text-sx-accent/80">
              ← Back to Pricing & Plans
            </Link>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
