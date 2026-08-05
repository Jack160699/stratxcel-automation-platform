"use client";

import { useState } from "react";
import Link from "next/link";

export default function AuditOnboardingPage() {
  const [tenantId, setTenantId] = useState("tenant_demo");
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [goals, setGoals] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{ paymentUrl?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) {
      setError("Please enter your Business Name");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/platform/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          businessName,
          industry,
          websiteUrl,
          goals,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to initialize audit");
        return;
      }

      setSuccessData({ paymentUrl: data.paymentUrl });
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      }
    } catch {
      setError("Network error initializing audit. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#05070e] text-white py-16 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="text-center">
          <span className="inline-block rounded-full bg-indigo-500/20 px-3.5 py-1 text-xs font-semibold uppercase tracking-widest text-indigo-300 border border-indigo-400/30">
            Initial Growth Step
          </span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Book Your Business Growth Audit (₹999)
          </h1>
          <p className="mt-3 text-base text-slate-300 sm:text-lg">
            Receive a deep-dive analysis of your brand, competitors, lead channels, and social media presence.
          </p>
        </div>

        {/* 7-Day Credit Callout Banner */}
        <div className="mt-8 rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/60 via-slate-900/80 to-purple-950/60 p-6 text-center shadow-lg">
          <p className="text-sm font-semibold text-indigo-200">
            💡 100% Fee Guarantee: The full ₹999 audit fee is adjusted against your first qualifying Launch or Growth subscription if purchased within 7 days of completion.
          </p>
        </div>

        {/* Audit Highlights */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <h3 className="font-semibold text-indigo-300">1. Brand & Competitor Audit</h3>
            <p className="mt-1 text-xs text-slate-400">Positioning snapshot, competitor benchmarks, and messaging opportunities.</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <h3 className="font-semibold text-indigo-300">2. Social & Channel Review</h3>
            <p className="mt-1 text-xs text-slate-400">Analysis of active social pages, ad accounts, website performance, and lead flow.</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <h3 className="font-semibold text-indigo-300">3. Actionable Growth Plan</h3>
            <p className="mt-1 text-xs text-slate-400">Step-by-step roadmap for content, WhatsApp workflows, and Meta campaigns.</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <h3 className="font-semibold text-indigo-300">4. Brand Brain Starter</h3>
            <p className="mt-1 text-xs text-slate-400">Initial AI Brand Brain profile created directly inside your Stratxcel OS workspace.</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-10 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 shadow-xl">
          <h2 className="text-xl font-bold text-white mb-6">Enter Business Information</h2>

          {error && (
            <div className="mb-6 rounded-xl border border-red-500/50 bg-red-950/40 p-4 text-xs font-semibold text-red-300">
              {error}
            </div>
          )}

          {successData?.paymentUrl && (
            <div className="mb-6 rounded-xl border border-emerald-500/50 bg-emerald-950/40 p-4 text-xs font-semibold text-emerald-300">
              Redirecting to Razorpay checkout... <a href={successData.paymentUrl} className="underline">Click here if not redirected</a>.
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Business / Brand Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Apex Fitness Studio"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Industry / Sector
                </label>
                <input
                  type="text"
                  placeholder="e.g. Healthcare, Retail, Real Estate"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Website URL (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Primary Growth Goals
              </label>
              <textarea
                rows={3}
                placeholder="Describe what you want to achieve (e.g. more local WhatsApp leads, better Instagram content, website overhaul)..."
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Workspace Tenant ID
              </label>
              <input
                type="text"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-8">
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 py-3.5 text-sm font-bold text-white shadow-lg transition-transform hover:scale-[1.01] disabled:opacity-50"
            >
              {loading ? "Processing Audit Order..." : "Proceed to ₹999 Audit Checkout"}
            </button>
          </div>
          <p className="mt-3 text-center text-xs text-slate-500">
            Secured by Razorpay. Includes GST receipt.
          </p>
        </form>

        <div className="mt-8 text-center">
          <Link href="/pricing" className="text-xs text-indigo-400 underline hover:text-indigo-300">
            ← Back to Pricing & Plans
          </Link>
        </div>
      </div>
    </div>
  );
}
