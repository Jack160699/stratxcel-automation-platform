"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCurrentTenant } from "../../CurrentTenantContext";
import {
  WEBSITE_SERVICE_PACKAGES,
  getRecommendedIndustryArchitecture,
  type WebsiteServicePackage,
} from "@stratxcel/payments-and-wallet";
import { SmartWebsiteCreator } from "@/components/site-builder/SmartWebsiteCreator";
import type { AuthorizedConnectorContext } from "@stratxcel/websites-and-domains/client";

export default function WebsiteFactoryPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;
  const businessName = active?.name || "Your Business";
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPackageId = searchParams.get("package") || "landing_page";

  const [selectedPackage, setSelectedPackage] = useState<WebsiteServicePackage>(
    WEBSITE_SERVICE_PACKAGES[initialPackageId] || WEBSITE_SERVICE_PACKAGES.landing_page
  );

  // Shop context loaded from Brand Brain
  const [shopData, setShopData] = useState<{
    industry?: string;
    phone?: string;
    location?: string;
    description?: string;
    services: string[];
    logoUrl?: string | null;
  }>({ services: [] });
  const [loadingShop, setLoadingShop] = useState(true);

  // Builder steps: "package" | "shop_confirm" | "style_select" | "builder"
  const [step, setStep] = useState<"package" | "shop_confirm" | "style_select" | "builder">(
    initialPackageId ? "shop_confirm" : "package"
  );

  const [selectedStyle, setSelectedStyle] = useState<"modern" | "warm" | "bold" | "luxury">("modern");

  // Load My Shop data
  useEffect(() => {
    if (!tenantId) return;
    // react-hooks/set-state-in-effect: same documented data-fetching
    // pattern as SxPrivateMedia.tsx -- setting the loading flag before
    // starting the fetch that resolves it, not an "adjust state from a
    // prop" case.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingShop(true);
    fetch(`/api/platform/brand?tenantId=${encodeURIComponent(tenantId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.brandBrain?.content) {
          const c = data.brandBrain.content;
          // Brand Brain Final UX + Data + Save System Section 7: prefer
          // the canonical, structured `services` array (active only) over
          // the legacy catalog_tags/products fields it superseded — same
          // fallback order getCanonicalServices (@stratxcel/brand-brain)
          // uses server-side, kept inline here since this is a client
          // component reading an already-fetched JSON payload, not a
          // second persisted data store.
          const services: string[] = Array.isArray(c.services) && c.services.length
            ? c.services.filter((s: { active?: boolean }) => s?.active !== false).map((s: { name?: string }) => s?.name).filter((n: unknown): n is string => Boolean(n))
            : c.catalog_tags || (c.products ? c.products.map((p: any) => p.name) : []);
          setShopData({
            industry: c.industry || "Local Retail & Services",
            phone: c.business_phone || "",
            location: c.location || "",
            description: c.positioning || "",
            services,
            logoUrl: c.logo_url || null,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoadingShop(false));
  }, [tenantId]);

  const recommendedArch = getRecommendedIndustryArchitecture(shopData.industry);

  // Found live during E2E testing: this page already fetches the tenant's
  // real Brand Brain data above (for the Step 2 pre-fill form) but never
  // forwarded any of it into <SmartWebsiteCreator>, which accepts a
  // connectorContext prop specifically to skip asking questions Brand Brain
  // already answers and to resolve the real business name. Every AI-built
  // site was therefore generated with no knowledge of the real business at
  // all, falling through to a regex-guessed or hardcoded placeholder name.
  //
  // Second real gap fixed here (Brand Brain Final UX + Data + Save System
  // Section 7): shopData.services was already fetched (for the Step 2
  // confirm screen) but never forwarded either — the website builder had
  // real business identity but zero knowledge of what the business
  // actually offers, so it could never pre-populate service/product pages
  // from a tenant's real saved catalog.
  const connectorContext: AuthorizedConnectorContext = {
    brandBrain: {
      businessName,
      industry: shopData.industry,
      logoUrl: shopData.logoUrl || undefined,
      story: shopData.description || undefined,
    },
    catalog: shopData.services.length ? { existingServices: shopData.services.map((title) => ({ title })) } : undefined,
  };

  if (!tenantId) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center p-6 text-center">
        <p className="text-base font-bold text-sx-text">Please select an active workspace</p>
        <Link href="/app" className="mt-3 text-xs font-semibold text-sx-accent hover:underline">
          Return to Home →
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-sx-bg text-sx-text overflow-hidden">
      {/* Fixed Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-sx-border bg-sx-surface-1 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/app/website")}
            className="flex h-8 w-8 items-center justify-center rounded-sx-sm border border-sx-border bg-sx-surface-2 text-sm text-sx-text hover:bg-sx-surface-3 transition-colors"
            aria-label="Back to Website & Domains"
          >
            ←
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-sx-text">Website Factory</h1>
              <span className="rounded-full bg-sx-accent/15 px-2 py-0.5 text-[10px] font-bold text-sx-accent">
                {selectedPackage.name}
              </span>
            </div>
            <p className="text-[11px] text-sx-text-muted">Build a high-converting website for {businessName}</p>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="hidden sm:flex items-center gap-2 text-xs font-medium">
          <span className={`px-2 py-1 rounded-sx-xs ${step === "package" ? "bg-sx-accent text-sx-accent-on font-bold" : "text-sx-text-muted"}`}>
            1. Package
          </span>
          <span className="text-sx-text-subtle">›</span>
          <span className={`px-2 py-1 rounded-sx-xs ${step === "shop_confirm" ? "bg-sx-accent text-sx-accent-on font-bold" : "text-sx-text-muted"}`}>
            2. Shop Details
          </span>
          <span className="text-sx-text-subtle">›</span>
          <span className={`px-2 py-1 rounded-sx-xs ${step === "style_select" ? "bg-sx-accent text-sx-accent-on font-bold" : "text-sx-text-muted"}`}>
            3. Style & Pages
          </span>
          <span className="text-sx-text-subtle">›</span>
          <span className={`px-2 py-1 rounded-sx-xs ${step === "builder" ? "bg-sx-accent text-sx-accent-on font-bold" : "text-sx-text-muted"}`}>
            4. Live Preview
          </span>
        </div>
      </header>

      {/* Main Creation Body */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 sx-thin-scroll">
        <div className="mx-auto max-w-4xl">
          {/* STEP 1: PACKAGE SELECTION */}
          {step === "package" && (
            <div className="flex flex-col gap-6 py-2">
              <div className="text-center max-w-xl mx-auto">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-sx-text">Choose Your Website Package</h2>
                <p className="mt-1 text-xs sm:text-sm text-sx-text-muted">
                  Professional website creation built around your shop, services, and local customers.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {Object.values(WEBSITE_SERVICE_PACKAGES).map((pkg) => (
                  <div
                    key={pkg.id}
                    onClick={() => setSelectedPackage(pkg)}
                    className={`flex flex-col justify-between rounded-sx-lg border p-5 transition-all cursor-pointer ${
                      selectedPackage.id === pkg.id
                        ? "border-sx-accent bg-sx-surface-1 shadow-md ring-1 ring-sx-accent"
                        : "border-sx-border bg-sx-surface-1 hover:border-sx-border-strong hover:bg-sx-surface-2"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-bold text-sx-text">{pkg.name}</h3>
                        {pkg.id === "five_page" && (
                          <span className="rounded-full bg-sx-accent/15 px-2 py-0.5 text-[10px] font-bold text-sx-accent">
                            Popular
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-sx-text-muted">{pkg.shortDescription}</p>

                      <div className="mt-4 flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-sx-text">₹{pkg.priceInr.toLocaleString("en-IN")}</span>
                        <span className="text-[11px] text-sx-text-subtle">/ package</span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-sx-text-muted font-medium">Turnaround: {pkg.turnaroundDays}</p>

                      <div className="mt-4 border-t border-sx-border/60 pt-3 space-y-1.5 text-xs text-sx-text">
                        {pkg.includedFeatures.slice(0, 5).map((f, idx) => (
                          <div key={idx} className="flex items-start gap-1.5">
                            <span className="text-emerald-500 font-bold">✓</span>
                            <span>{f}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPackage(pkg);
                        setStep("shop_confirm");
                      }}
                      className={`mt-5 w-full rounded-sx-sm py-2.5 text-xs font-bold transition-colors ${
                        selectedPackage.id === pkg.id
                          ? "bg-sx-accent text-sx-accent-on hover:bg-sx-accent/90"
                          : "border border-sx-border bg-sx-surface-2 text-sx-text hover:bg-sx-surface-3"
                      }`}
                    >
                      {pkg.ctaLabel}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 2: CONFIRM SHOP IDENTITY */}
          {step === "shop_confirm" && (
            <div className="flex flex-col gap-6 py-2">
              <div className="flex items-center justify-between border-b border-sx-border pb-3">
                <div>
                  <h2 className="text-lg font-bold text-sx-text">Step 2: Confirm Shop Identity</h2>
                  <p className="text-xs text-sx-text-muted">StratXcel pre-filled this from My Shop. Everything will appear automatically on your website.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep("package")}
                  className="text-xs font-semibold text-sx-text-muted hover:text-sx-text"
                >
                  ← Change Package
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 rounded-sx-lg border border-sx-border bg-sx-surface-1 p-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-sx-text">Shop / Business Name</label>
                  <input
                    type="text"
                    value={businessName}
                    readOnly
                    className="h-9 rounded-sx-sm border border-sx-border bg-sx-surface-2 px-3 text-xs text-sx-text font-semibold"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-sx-text">Business Category / Industry</label>
                  <input
                    type="text"
                    value={shopData.industry || ""}
                    onChange={(e) => setShopData((prev) => ({ ...prev, industry: e.target.value }))}
                    placeholder="e.g. Salon, Restaurant, Bakery, Clinic..."
                    className="h-9 rounded-sx-sm border border-sx-border bg-sx-surface-1 px-3 text-xs text-sx-text"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-sx-text">WhatsApp / Contact Phone</label>
                  <input
                    type="text"
                    value={shopData.phone || ""}
                    onChange={(e) => setShopData((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder="e.g. +91 98765 43210"
                    className="h-9 rounded-sx-sm border border-sx-border bg-sx-surface-1 px-3 text-xs text-sx-text"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-sx-text">Shop Address & Location</label>
                  <input
                    type="text"
                    value={shopData.location || ""}
                    onChange={(e) => setShopData((prev) => ({ ...prev, location: e.target.value }))}
                    placeholder="e.g. 12 Main Market, Sector 18, Noida"
                    className="h-9 rounded-sx-sm border border-sx-border bg-sx-surface-1 px-3 text-xs text-sx-text"
                  />
                </div>

                <div className="sm:col-span-2 flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-sx-text">Shop Description & Speciality</label>
                  <textarea
                    rows={2}
                    value={shopData.description || ""}
                    onChange={(e) => setShopData((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Briefly describe what makes your shop the best choice in the neighborhood..."
                    className="rounded-sx-sm border border-sx-border bg-sx-surface-1 p-3 text-xs text-sx-text"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setStep("style_select")}
                  className="rounded-sx-sm bg-sx-accent px-5 py-2.5 text-xs font-bold text-sx-accent-on hover:bg-sx-accent/90"
                >
                  Continue to Style & Pages →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: STYLE & INDUSTRY PAGE RECOMMENDATIONS */}
          {step === "style_select" && (
            <div className="flex flex-col gap-6 py-2">
              <div className="flex items-center justify-between border-b border-sx-border pb-3">
                <div>
                  <h2 className="text-lg font-bold text-sx-text">Step 3: Visual Style & Recommended Architecture</h2>
                  <p className="text-xs text-sx-text-muted">Tailored specifically for {shopData.industry || businessName}.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep("shop_confirm")}
                  className="text-xs font-semibold text-sx-text-muted hover:text-sx-text"
                >
                  ← Back to Details
                </button>
              </div>

              {/* Recommended Architecture Box */}
              <div className="rounded-sx-lg border border-sx-accent/40 bg-sx-accent-muted/40 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-sx-accent uppercase tracking-wider">
                    Recommended Architecture for {shopData.industry}
                  </p>
                  <span className="text-xs font-bold text-sx-text">CTA: {recommendedArch.ctaStyle}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedPackage.id === "landing_page" ? (
                    <span className="rounded-sx-pill border border-sx-accent bg-sx-surface-1 px-3 py-1 text-xs font-semibold text-sx-text">
                      Landing Page (All-in-One Conversion Flow)
                    </span>
                  ) : (
                    recommendedArch.pages.map((p, idx) => (
                      <span
                        key={idx}
                        className="rounded-sx-pill border border-sx-border bg-sx-surface-1 px-3 py-1 text-xs font-semibold text-sx-text"
                      >
                        📄 {p}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Style Selection */}
              <div>
                <p className="text-xs font-bold text-sx-text mb-3">Choose Visual Style Direction:</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { id: "modern", label: "Modern & Clean", desc: "Sleek typography & spacious layout", icon: "✨" },
                    { id: "warm", label: "Warm & Friendly", desc: "Inviting colors & community feel", icon: "🏡" },
                    { id: "bold", label: "Bold & Vibrant", desc: "High energy & eye-catching deals", icon: "⚡" },
                    { id: "luxury", label: "Minimalist Luxury", desc: "Premium dark/gold aesthetic", icon: "👑" },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setSelectedStyle(st.id as any)}
                      className={`flex flex-col items-start rounded-sx-md border p-3.5 text-left transition-all ${
                        selectedStyle === st.id
                          ? "border-sx-accent bg-sx-accent-muted text-sx-text ring-1 ring-sx-accent"
                          : "border-sx-border bg-sx-surface-1 text-sx-text hover:bg-sx-surface-2"
                      }`}
                    >
                      <span className="text-xl mb-1.5">{st.icon}</span>
                      <p className="text-xs font-bold">{st.label}</p>
                      <p className="mt-1 text-[10px] text-sx-text-muted">{st.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep("builder")}
                  className="rounded-sx-sm bg-sx-accent px-5 py-2.5 text-xs font-bold text-sx-accent-on hover:bg-sx-accent/90"
                >
                  Launch Interactive Live Builder →
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: INTERACTIVE LIVE BUILDER WORKSPACE */}
          {step === "builder" && (
            <div className="flex flex-col gap-4 py-2">
              <div className="flex items-center justify-between border-b border-sx-border pb-3">
                <div>
                  <h2 className="text-lg font-bold text-sx-text">Interactive Live Website Builder</h2>
                  <p className="text-xs text-sx-text-muted">Generate, customize, and preview your live website.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep("style_select")}
                  className="text-xs font-semibold text-sx-text-muted hover:text-sx-text"
                >
                  ← Change Style
                </button>
              </div>

              <div className="rounded-sx-lg border border-sx-border bg-sx-surface-1 p-4 sm:p-5">
                <SmartWebsiteCreator
                  tenantId={tenantId}
                  connectorContext={connectorContext}
                  onClose={() => router.push("/app/website")}
                  onPublish={() => router.push("/app/website")}
                />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
