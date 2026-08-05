"use client";

import { useState } from "react";
import Link from "next/link";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";

export default function AuditPage() {
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1 — Business Profile
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");
  const [teamSize, setTeamSize] = useState("1-5");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [preferredMethod, setPreferredMethod] = useState("WhatsApp");
  const [preferredTime, setPreferredTime] = useState("Morning (9 AM - 12 PM)");

  // Step 2 — Offer & Customer
  const [primaryOffer, setPrimaryOffer] = useState("");
  const [priceRange, setPriceRange] = useState("₹10,000 - ₹50,000");
  const [targetCustomer, setTargetCustomer] = useState("");
  const [targetGeography, setTargetGeography] = useState("Regional / City");
  const [businessType, setBusinessType] = useState("B2C");
  const [differentiator, setDifferentiator] = useState("");
  const [competitors, setCompetitors] = useState("");

  // Step 3 — Digital Presence
  const [websiteStatus, setWebsiteStatus] = useState("Needs overhaul");
  const [activeChannels, setActiveChannels] = useState<string[]>(["Instagram", "WhatsApp Business"]);
  const [crmStatus, setCrmStatus] = useState("None / Manual Spreadsheets");

  // Step 4 — Marketing & Sales Process
  const [monthlyLeads, setMonthlyLeads] = useState("10 - 50 leads");
  const [responseTime, setResponseTime] = useState("< 1 hour");
  const [adSpendRange, setAdSpendRange] = useState("₹10,000 - ₹50,000 / mo");
  const [conversionChallenge, setConversionChallenge] = useState("");

  // Step 5 — Goals & Constraints
  const [primaryGoal, setPrimaryGoal] = useState("Automate WhatsApp lead follow-up & social content");
  const [targetTimeframe, setTargetTimeframe] = useState("Within 30 days");
  const [budgetRange, setBudgetRange] = useState("Growth Plan (₹18,999 / mo)");
  const [constraints, setConstraints] = useState("");

  // Step 6 — Consent & Metadata
  const [consentToContact, setConsentToContact] = useState(true);
  const [hpField, setHpField] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);

  const toggleChannel = (channel: string) => {
    setActiveChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]
    );
  };

  const handleNext = () => {
    setError(null);
    if (currentStep === 1) {
      if (!businessName.trim() || !contactEmail.trim()) {
        setError("Please fill in required fields: Business Name and Contact Email.");
        return;
      }
    }
    setCurrentStep((prev) => Math.min(6, prev + 1));
  };

  const handlePrev = () => {
    setError(null);
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!businessName.trim() || !contactEmail.trim()) {
      setError("Please fill in required fields: Business Name and Contact Email.");
      return;
    }

    if (!consentToContact) {
      setError("Please confirm consent to contact regarding this audit.");
      return;
    }

    setLoading(true);
    setError(null);

    const auditAnswers = {
      businessProfile: {
        businessName,
        industry,
        location,
        teamSize,
        websiteUrl,
        contactName,
        contactEmail,
        contactPhone,
        preferredMethod,
        preferredTime,
      },
      offerAndCustomer: {
        primaryOffer,
        priceRange,
        targetCustomer,
        targetGeography,
        businessType,
        differentiator,
        competitors,
      },
      digitalPresence: {
        websiteStatus,
        activeChannels,
        crmStatus,
      },
      marketingAndSales: {
        monthlyLeads,
        responseTime,
        adSpendRange,
        conversionChallenge,
      },
      goalsAndConstraints: {
        primaryGoal,
        targetTimeframe,
        budgetRange,
        constraints,
      },
    };

    try {
      const res = await fetch("/api/public/audit-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: businessName.trim(),
          contactEmail: contactEmail.trim(),
          contactPhone: contactPhone.trim() || undefined,
          industry: industry.trim() || undefined,
          websiteUrl: websiteUrl.trim() || undefined,
          goals: primaryGoal || undefined,
          hpField,
          auditAnswers,
          questionnaireVersion: "v2_multistep",
          completionPercentage: 100,
          preferredContactMethod: preferredMethod,
          preferredContactTime: preferredTime,
          consentToContact,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to submit audit request. Please check your inputs.");
        return;
      }

      setSubmittedMessage(
        data.message ??
          "Your audit request has been received. Our team will contact you to confirm scope, payment and delivery."
      );
    } catch {
      setError("Network error submitting audit request. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const completionPct = Math.round((currentStep / 6) * 100);

  return (
    <div className="flex min-h-screen flex-col bg-sx-bg text-sx-text">
      <PublicHeader />
      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          {/* Header */}
          <div className="text-center">
            <span className="inline-block rounded-sx-pill border border-sx-accent/40 bg-sx-accent/10 px-3.5 py-1 font-sx-mono text-[11px] font-semibold uppercase tracking-widest text-sx-accent">
              Business Growth Audit Questionnaire
            </span>
            <h1 className="mt-4 font-sx-sans text-3xl font-extrabold tracking-tight sm:text-4xl text-sx-text">
              Request Your Business Growth Audit (₹999)
            </h1>
            <p className="mt-2 font-sx-sans text-sm text-sx-text-muted sm:text-base">
              Complete this 5-minute questionnaire to help us analyze your brand, competitors, lead channels, and growth potential.
            </p>
          </div>

          {/* 100% Fee Adjustment Banner */}
          <div className="mt-6 rounded-sx-lg border border-sx-accent/30 bg-gradient-to-r from-sx-accent/10 via-sx-surface-2 to-purple-950/20 p-5 text-center shadow-lg">
            <p className="font-sx-sans text-xs font-semibold text-sx-accent sm:text-sm">
              💡 100% Fee Guarantee: After confirmation and payment, the full ₹999 audit fee is adjusted against a qualifying subscription purchased within seven days of audit completion.
            </p>
          </div>

          {/* Progress Bar */}
          {!submittedMessage && (
            <div className="mt-8">
              <div className="flex items-center justify-between text-xs font-sx-mono text-sx-text-subtle mb-2">
                <span>Step {currentStep} of 6</span>
                <span>{completionPct}% Completed</span>
              </div>
              <div className="h-2 w-full rounded-full bg-sx-surface-2 overflow-hidden border border-sx-border">
                <div
                  className="h-full bg-sx-accent transition-all duration-300 ease-out"
                  style={{ width: `${completionPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Questionnaire Form */}
          <form onSubmit={handleSubmit} className="mt-8 rounded-sx-lg border border-sx-border bg-sx-surface-1 p-6 sm:p-8 shadow-xl">
            {/* Hidden Honeypot Input */}
            <div className="hidden" aria-hidden="true">
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={hpField}
                onChange={(e) => setHpField(e.target.value)}
              />
            </div>

            {error && (
              <div className="mb-6 rounded-sx-md border border-red-500/50 bg-red-950/40 p-4 text-xs font-semibold text-red-300">
                {error}
              </div>
            )}

            {submittedMessage ? (
              <div className="py-8 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-2xl font-bold">
                  ✓
                </div>
                <h2 className="mt-4 font-sx-sans text-2xl font-bold text-sx-text">Request Received!</h2>
                <p className="mt-3 font-sx-sans text-sm text-sx-text-muted leading-relaxed max-w-lg mx-auto">
                  {submittedMessage}
                </p>
                <div className="mt-8 flex justify-center gap-4">
                  <Link
                    href="/pricing"
                    className="rounded-sx-sm bg-sx-accent px-6 py-2.5 font-sx-sans text-xs font-bold text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)]"
                  >
                    View Commercial Plans
                  </Link>
                  <Link
                    href="/"
                    className="rounded-sx-sm border border-sx-border-strong px-6 py-2.5 font-sx-sans text-xs font-medium text-sx-text hover:bg-sx-surface-2"
                  >
                    Return Home
                  </Link>
                </div>
              </div>
            ) : (
              <>
                {/* STEP 1: BUSINESS PROFILE */}
                {currentStep === 1 && (
                  <div className="space-y-4">
                    <h2 className="font-sx-sans text-lg font-bold text-sx-text border-b border-sx-border pb-3">
                      Step 1 of 6: Business & Contact Profile
                    </h2>

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
                        className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-2.5 text-sm text-sx-text placeholder-sx-text-subtle focus:border-sx-accent focus:outline-none"
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                          Industry / Category
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Healthcare, Fitness, E-commerce"
                          value={industry}
                          onChange={(e) => setIndustry(e.target.value)}
                          className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-2.5 text-sm text-sx-text focus:border-sx-accent focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                          Location (City, State)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Mumbai, Maharashtra"
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-2.5 text-sm text-sx-text focus:border-sx-accent focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                          Team Size
                        </label>
                        <select
                          value={teamSize}
                          onChange={(e) => setTeamSize(e.target.value)}
                          className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-2.5 text-sm text-sx-text focus:border-sx-accent focus:outline-none"
                        >
                          <option value="1-5">1 - 5 team members</option>
                          <option value="6-20">6 - 20 team members</option>
                          <option value="21-50">21 - 50 team members</option>
                          <option value="50+">50+ team members</option>
                        </select>
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
                          className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-2.5 text-sm text-sx-text focus:border-sx-accent focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                          Contact Person Name
                        </label>
                        <input
                          type="text"
                          placeholder="John Doe"
                          value={contactName}
                          onChange={(e) => setContactName(e.target.value)}
                          className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-2.5 text-sm text-sx-text focus:border-sx-accent focus:outline-none"
                        />
                      </div>

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
                          className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-2.5 text-sm text-sx-text focus:border-sx-accent focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                          WhatsApp / Phone
                        </label>
                        <input
                          type="tel"
                          placeholder="+91 98765 43210"
                          value={contactPhone}
                          onChange={(e) => setContactPhone(e.target.value)}
                          className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-2.5 text-sm text-sx-text focus:border-sx-accent focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                          Preferred Contact Method
                        </label>
                        <select
                          value={preferredMethod}
                          onChange={(e) => setPreferredMethod(e.target.value)}
                          className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-2.5 text-sm text-sx-text focus:border-sx-accent focus:outline-none"
                        >
                          <option value="WhatsApp">WhatsApp</option>
                          <option value="Email">Email</option>
                          <option value="Phone Call">Phone Call</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                          Preferred Time Window
                        </label>
                        <select
                          value={preferredTime}
                          onChange={(e) => setPreferredTime(e.target.value)}
                          className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-2.5 text-sm text-sx-text focus:border-sx-accent focus:outline-none"
                        >
                          <option value="Morning (9 AM - 12 PM)">Morning (9 AM - 12 PM)</option>
                          <option value="Afternoon (12 PM - 5 PM)">Afternoon (12 PM - 5 PM)</option>
                          <option value="Evening (5 PM - 8 PM)">Evening (5 PM - 8 PM)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 2: OFFER & CUSTOMER */}
                {currentStep === 2 && (
                  <div className="space-y-4">
                    <h2 className="font-sx-sans text-lg font-bold text-sx-text border-b border-sx-border pb-3">
                      Step 2 of 6: Offer, Audience & Competitors
                    </h2>

                    <div>
                      <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                        Primary Products or Services Offered
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Personal training memberships, Corporate wellness programs"
                        value={primaryOffer}
                        onChange={(e) => setPrimaryOffer(e.target.value)}
                        className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-2.5 text-sm text-sx-text focus:border-sx-accent focus:outline-none"
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                          Average Order Value
                        </label>
                        <select
                          value={priceRange}
                          onChange={(e) => setPriceRange(e.target.value)}
                          className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-2.5 text-sm text-sx-text focus:border-sx-accent focus:outline-none"
                        >
                          <option value="< ₹10,000">&lt; ₹10,000</option>
                          <option value="₹10,000 - ₹50,000">₹10,000 - ₹50,000</option>
                          <option value="₹50,000 - ₹200,000">₹50,000 - ₹200,000</option>
                          <option value="₹200,000+">₹200,000+</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                          Target Geography
                        </label>
                        <select
                          value={targetGeography}
                          onChange={(e) => setTargetGeography(e.target.value)}
                          className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-2.5 text-sm text-sx-text focus:border-sx-accent focus:outline-none"
                        >
                          <option value="Local / Neighborhood">Local / Neighborhood</option>
                          <option value="Regional / City">Regional / City</option>
                          <option value="National (Pan India)">National (Pan India)</option>
                          <option value="International">International</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                          Business Model
                        </label>
                        <select
                          value={businessType}
                          onChange={(e) => setBusinessType(e.target.value)}
                          className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-2.5 text-sm text-sx-text focus:border-sx-accent focus:outline-none"
                        >
                          <option value="B2C">B2C (Consumer)</option>
                          <option value="B2B">B2B (Business)</option>
                          <option value="Both B2B and B2C">Both B2B and B2C</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                        Ideal Customer Description
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Working professionals aged 25-45 looking for guided fitness in South Mumbai"
                        value={targetCustomer}
                        onChange={(e) => setTargetCustomer(e.target.value)}
                        className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-2.5 text-sm text-sx-text focus:border-sx-accent focus:outline-none"
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                          Key Differentiator
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Certified international trainers, 24/7 access"
                          value={differentiator}
                          onChange={(e) => setDifferentiator(e.target.value)}
                          className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-2.5 text-sm text-sx-text focus:border-sx-accent focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                          Top Competitors (Names or URLs)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Cult.fit, Gold's Gym"
                          value={competitors}
                          onChange={(e) => setCompetitors(e.target.value)}
                          className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-2.5 text-sm text-sx-text focus:border-sx-accent focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 3: DIGITAL PRESENCE */}
                {currentStep === 3 && (
                  <div className="space-y-4">
                    <h2 className="font-sx-sans text-lg font-bold text-sx-text border-b border-sx-border pb-3">
                      Step 3 of 6: Active Digital Channels & Systems
                    </h2>

                    <div>
                      <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-2">
                        Active Social Channels & Profiles (Select all that apply)
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {["Instagram", "Facebook", "WhatsApp Business", "Google Business Profile", "LinkedIn", "YouTube"].map(
                          (ch) => (
                            <button
                              type="button"
                              key={ch}
                              onClick={() => toggleChannel(ch)}
                              className={`rounded-sx-sm border px-3 py-2 text-left font-sx-sans text-xs font-medium transition-colors ${
                                activeChannels.includes(ch)
                                  ? "border-sx-accent bg-sx-accent/10 text-sx-accent font-semibold"
                                  : "border-sx-border-strong bg-sx-bg text-sx-text-muted hover:border-sx-border"
                              }`}
                            >
                              {activeChannels.includes(ch) ? "✓ " : "+ "} {ch}
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 pt-2">
                      <div>
                        <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                          Current Website Status
                        </label>
                        <select
                          value={websiteStatus}
                          onChange={(e) => setWebsiteStatus(e.target.value)}
                          className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-2.5 text-sm text-sx-text focus:border-sx-accent focus:outline-none"
                        >
                          <option value="No website currently">No website currently</option>
                          <option value="Basic landing page">Basic landing page</option>
                          <option value="Needs overhaul & better conversion">Needs overhaul & better conversion</option>
                          <option value="Modern & active">Modern & active</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                          Current CRM / Lead Tracking System
                        </label>
                        <select
                          value={crmStatus}
                          onChange={(e) => setCrmStatus(e.target.value)}
                          className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-2.5 text-sm text-sx-text focus:border-sx-accent focus:outline-none"
                        >
                          <option value="None / Manual Spreadsheets">None / Manual Spreadsheets</option>
                          <option value="WhatsApp Business Only">WhatsApp Business Only</option>
                          <option value="Basic CRM (Zoho/HubSpot/Google Sheets)">Basic CRM (Zoho/HubSpot/Google Sheets)</option>
                          <option value="Dedicated Sales Team CRM">Dedicated Sales Team CRM</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 4: MARKETING & SALES PROCESS */}
                {currentStep === 4 && (
                  <div className="space-y-4">
                    <h2 className="font-sx-sans text-lg font-bold text-sx-text border-b border-sx-border pb-3">
                      Step 4 of 6: Current Marketing & Lead Volumes
                    </h2>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                          Approx. Monthly Lead Volume
                        </label>
                        <select
                          value={monthlyLeads}
                          onChange={(e) => setMonthlyLeads(e.target.value)}
                          className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-2.5 text-sm text-sx-text focus:border-sx-accent focus:outline-none"
                        >
                          <option value="< 10 leads">&lt; 10 leads / mo</option>
                          <option value="10 - 50 leads">10 - 50 leads / mo</option>
                          <option value="50 - 200 leads">50 - 200 leads / mo</option>
                          <option value="200+ leads">200+ leads / mo</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                          Average Lead Response Time
                        </label>
                        <select
                          value={responseTime}
                          onChange={(e) => setResponseTime(e.target.value)}
                          className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-2.5 text-sm text-sx-text focus:border-sx-accent focus:outline-none"
                        >
                          <option value="< 15 minutes">&lt; 15 minutes</option>
                          <option value="< 1 hour">&lt; 1 hour</option>
                          <option value="Same day">Same day</option>
                          <option value="2+ days / Manual">2+ days / Manual</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                          Monthly Advertising Budget
                        </label>
                        <select
                          value={adSpendRange}
                          onChange={(e) => setAdSpendRange(e.target.value)}
                          className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-2.5 text-sm text-sx-text focus:border-sx-accent focus:outline-none"
                        >
                          <option value="₹0 (Organic Only)">₹0 (Organic Only)</option>
                          <option value="< ₹10,000 / mo">&lt; ₹10,000 / mo</option>
                          <option value="₹10,000 - ₹50,000 / mo">₹10,000 - ₹50,000 / mo</option>
                          <option value="₹50,000 - ₹200,000 / mo">₹50,000 - ₹200,000 / mo</option>
                          <option value="₹200,000+ / mo">₹200,000+ / mo</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                        Current Biggest Lead / Sales Bottleneck
                      </label>
                      <textarea
                        rows={2}
                        placeholder="e.g. Not enough qualified leads, slow WhatsApp response, inconsistent Instagram posting..."
                        value={conversionChallenge}
                        onChange={(e) => setConversionChallenge(e.target.value)}
                        className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-2.5 text-sm text-sx-text focus:border-sx-accent focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* STEP 5: GOALS & CONSTRAINTS */}
                {currentStep === 5 && (
                  <div className="space-y-4">
                    <h2 className="font-sx-sans text-lg font-bold text-sx-text border-b border-sx-border pb-3">
                      Step 5 of 6: Primary Goals & Requirements
                    </h2>

                    <div>
                      <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                        Primary Growth Goal
                      </label>
                      <select
                        value={primaryGoal}
                        onChange={(e) => setPrimaryGoal(e.target.value)}
                        className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-2.5 text-sm text-sx-text focus:border-sx-accent focus:outline-none"
                      >
                        <option value="Automate WhatsApp lead follow-up & social content">Automate WhatsApp lead follow-up & social content</option>
                        <option value="Launch a new high-converting 5-page website">Launch a new high-converting 5-page website</option>
                        <option value="Scale Meta ad campaign workflows & lead pipeline">Scale Meta ad campaign workflows & lead pipeline</option>
                        <option value="Full AI operating system (Content + Website + CRM + Ads)">Full AI operating system (Content + Website + CRM + Ads)</option>
                      </select>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                          Target Implementation Timeframe
                        </label>
                        <select
                          value={targetTimeframe}
                          onChange={(e) => setTargetTimeframe(e.target.value)}
                          className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-2.5 text-sm text-sx-text focus:border-sx-accent focus:outline-none"
                        >
                          <option value="Immediate (As soon as possible)">Immediate (As soon as possible)</option>
                          <option value="Within 30 days">Within 30 days</option>
                          <option value="1 - 3 months">1 - 3 months</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                          Intended Subscription Package
                        </label>
                        <select
                          value={budgetRange}
                          onChange={(e) => setBudgetRange(e.target.value)}
                          className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-2.5 text-sm text-sx-text focus:border-sx-accent focus:outline-none"
                        >
                          <option value="Launch Plan (₹9,499 / mo)">Launch Plan (₹9,499 / mo)</option>
                          <option value="Growth Plan (₹18,999 / mo)">Growth Plan (₹18,999 / mo)</option>
                          <option value="Custom Growth (Starting ₹23,999 / mo)">Custom Growth (Starting ₹23,999 / mo)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block font-sx-mono text-xs font-semibold uppercase tracking-wider text-sx-text-subtle mb-1">
                        Any Non-Negotiables or Workflows That Must Stay Manual
                      </label>
                      <textarea
                        rows={2}
                        placeholder="e.g. All ad budgets must require owner approval; specific brand voice guidelines..."
                        value={constraints}
                        onChange={(e) => setConstraints(e.target.value)}
                        className="w-full rounded-sx-sm border border-sx-border-strong bg-sx-bg px-4 py-2.5 text-sm text-sx-text focus:border-sx-accent focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* STEP 6: REVIEW & CONSENT */}
                {currentStep === 6 && (
                  <div className="space-y-4">
                    <h2 className="font-sx-sans text-lg font-bold text-sx-text border-b border-sx-border pb-3">
                      Step 6 of 6: Summary & Confirmation
                    </h2>

                    <div className="rounded-sx-md border border-sx-border bg-sx-bg p-4 space-y-2 text-xs">
                      <p><strong className="text-sx-text">Business:</strong> {businessName} ({industry || "General"}) — {location || "N/A"}</p>
                      <p><strong className="text-sx-text">Contact:</strong> {contactName} ({contactEmail}, {contactPhone || "No phone"})</p>
                      <p><strong className="text-sx-text">Preferred Channel:</strong> {preferredMethod} ({preferredTime})</p>
                      <p><strong className="text-sx-text">Primary Offer:</strong> {primaryOffer || "N/A"} ({priceRange})</p>
                      <p><strong className="text-sx-text">Active Channels:</strong> {activeChannels.join(", ")}</p>
                      <p><strong className="text-sx-text">Goal:</strong> {primaryGoal}</p>
                      <p><strong className="text-sx-text">Plan Fit:</strong> {budgetRange}</p>
                    </div>

                    <div className="pt-2">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={consentToContact}
                          onChange={(e) => setConsentToContact(e.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-sx-border-strong text-sx-accent focus:ring-sx-accent"
                        />
                        <span className="font-sx-sans text-xs text-sx-text-muted leading-relaxed">
                          I confirm that the information provided is accurate and consent to Stratxcel reviewing our public business channels and contacting us regarding this Business Growth Audit.
                        </span>
                      </label>
                    </div>

                    <p className="text-[11px] text-sx-text-subtle border-t border-sx-border pt-3 italic">
                      Note: Submitting this questionnaire does not process immediate online payment. Our team will verify scope and deliver confirmation & payment instructions.
                    </p>
                  </div>
                )}

                {/* Step Navigation Controls */}
                <div className="mt-8 flex items-center justify-between border-t border-sx-border pt-4">
                  {currentStep > 1 ? (
                    <button
                      type="button"
                      onClick={handlePrev}
                      className="rounded-sx-sm border border-sx-border-strong px-5 py-2.5 font-sx-sans text-xs font-semibold text-sx-text hover:bg-sx-surface-2"
                    >
                      ← Previous
                    </button>
                  ) : (
                    <div />
                  )}

                  {currentStep < 6 ? (
                    <button
                      type="button"
                      onClick={handleNext}
                      className="rounded-sx-sm bg-sx-accent px-6 py-2.5 font-sx-sans text-xs font-bold text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)]"
                    >
                      Next Step →
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={loading}
                      className="rounded-sx-sm bg-sx-accent px-8 py-3 font-sx-sans text-xs font-bold text-sx-accent-on shadow-lg transition-colors hover:bg-[color:var(--sx-accent-hover)] disabled:opacity-50"
                    >
                      {loading ? "Submitting Audit Questionnaire..." : "Submit Growth Audit Request (₹999)"}
                    </button>
                  )}
                </div>
              </>
            )}
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
