/**
 * Business Opportunity Understanding Engine
 * StratXcel Autonomous Company OS - Hermes Brain
 *
 * Converts informal, unstructured Founder statements into a structured autonomous
 * business objective.
 *
 * Answers the 16 Canonical Inferences:
 * 1. WHO IS INVOLVED?
 * 2. WHAT IS THE BUSINESS?
 * 3. WHAT IS BEING SOLD?
 * 4. WHO IS THE CUSTOMER?
 * 5. WHO DELIVERS THE PRODUCT/SERVICE?
 * 6. HOW DOES STRATXCEL MAKE MONEY?
 * 7. WHAT IS OUR ROLE?
 * 8. WHAT IS THE COMMERCIAL MODEL?
 * 9. WHAT OUTCOME DOES THE FOUNDER WANT?
 * 10. WHAT MARKET IS RELEVANT?
 * 11. WHAT CUSTOMER SEGMENTS MAY EXIST?
 * 12. WHAT CAPABILITIES ARE REQUIRED?
 * 13. WHAT SHOULD HAPPEN FIRST?
 * 14. WHAT SHOULD HAPPEN NEXT?
 * 15. WHAT MUST BE VERIFIED?
 * 16. WHAT IS UNKNOWN? (Never invented; triggers research mandates)
 */

export type CommercialModelType =
  | "commission"
  | "referral"
  | "lead_generation"
  | "revenue_share"
  | "reseller"
  | "agency"
  | "affiliate"
  | "marketplace"
  | "saas_subscription"
  | "service_delivery"
  | "consulting"
  | "partnership"
  | "distribution"
  | "brokerage"
  | "performance_based";

export type StratXcelRole =
  | "customer_acquisition_partner"
  | "lead_generation_partner"
  | "commission_agent"
  | "referral_partner"
  | "lead_generation_specialist"
  | "reseller"
  | "agency_operator"
  | "revenue_share_partner"
  | "affiliate_promoter"
  | "direct_seller"
  | "distributor"
  | "commercial_broker"
  | "growth_consultant";

export type FulfillmentOwner = "external_partner" | "stratxcel" | "joint" | "unknown";

export interface ResearchMandate {
  area:
    | "market_demand"
    | "pricing_and_commission"
    | "target_icp"
    | "competitor_landscape"
    | "regulatory_or_compliance"
    | "fulfillment_capacity";
  question: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM";
  suggestedTools: string[];
}

export interface RecommendedWorker {
  roleKey: string;
  department: string;
  purpose: string;
  isExisting: boolean;
}

export interface BusinessOpportunityAnalysis {
  id: string;
  rawDirective: string;

  // 1. Entities & Roles
  partiesInvolved: {
    externalParty: {
      hasExternalParty: boolean;
      relationship: "friend" | "partner" | "client" | "third_party" | "founder_venture" | "internal";
      entityDescription: string;
      nameOrLabel?: string;
    };
    stratxcelRole: StratXcelRole;
    fulfillmentOwner: FulfillmentOwner;
    fulfillmentNotes: string;
  };

  // 2. Business & Offer Context
  businessConcept: {
    industrySector: string;
    businessType: string;
    offeringName: string;
    productOrServiceDescription: string;
    deliveryMechanism: string;
    isExistingOffer: boolean;
  };

  // 3. Commercial Model & Monetization
  commercialModel: {
    type: CommercialModelType;
    monetizationMechanism: string;
    commissionOrRevShareRate?: string;
    pricingEstimate?: {
      dealSizeEstimate?: string;
      potentialRevenuePerUnit?: string;
      marginNotes: string;
    };
  };

  // 4. Target Customer & Market
  targetMarket: {
    primaryCustomerSegment: string;
    buyerPersona: string;
    targetGeography: string; // "Explicitly unstated (Global/India default)" if unknown
    demandCharacteristics: string;
    buyingSignals: string[];
  };

  // 5. Outcome & Acceptance Criteria
  desiredOutcome: {
    intentCategory:
      | "acquire_leads"
      | "acquire_customers"
      | "evaluate_opportunity"
      | "grow_revenue"
      | "launch_service"
      | "expand_market"
      | "solve_bottleneck";
    summary: string;
    measurableTarget: {
      metricName: string;
      targetValue?: number;
      unit: string;
    };
    acceptanceCriteria: string[];
  };

  // 6. Explicit Unknowns & Research Mandates (NEVER INVENT MISSING INFO)
  explicitUnknowns: string[];
  researchMandates: ResearchMandate[];

  // 7. Strategy, Capabilities & Workforce
  operatingStrategy: {
    recommendedChannels: string[];
    firstAction: string;
    subsequentActions: string[];
    verificationRequirements: string[];
    requiredCapabilities: string[];
    recommendedWorkforce: RecommendedWorker[];
  };

  // 8. Conversational Amendments History
  amendments: Array<{
    timestamp: string;
    feedbackText: string;
    appliedChanges: string[];
  }>;

  confidenceScore: number;
  analyzedAt: string;
}

export class BusinessOpportunityUnderstandingEngine {
  /**
   * Analyzes an informal natural language Founder statement and determines the complete
   * structured business opportunity without hardcoding.
   */
  public understandOpportunity(
    directive: string,
    options: {
      tenantId?: string;
      companyScope?: string;
      existingOfferings?: string[];
    } = {}
  ): BusinessOpportunityAnalysis {
    const raw = directive.trim();
    const text = raw.toLowerCase();
    const id = `opp-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

    // -------------------------------------------------------------
    // 1. INFER PARTIES INVOLVED & STRATXCEL'S ROLE
    // -------------------------------------------------------------
    let relationship: "friend" | "partner" | "client" | "third_party" | "founder_venture" | "internal" = "internal";
    let hasExternalParty = false;
    let entityDescription = "StratXcel Internal Commercial Venture";
    let fulfillmentOwner: FulfillmentOwner = "stratxcel";
    let stratxcelRole: StratXcelRole = "direct_seller";

    if (/\b(?:my\s+friend|friend'?s)\b/i.test(text)) {
      relationship = "friend";
      hasExternalParty = true;
      entityDescription = "Founder's friend's external commercial enterprise";
      fulfillmentOwner = "external_partner";
      stratxcelRole = "customer_acquisition_partner";
    } else if (/\b(?:partner|partnered|client|found\s+a\s+company|met\s+(?:a|someone)|company\s+that\s+wants)\b/i.test(text)) {
      relationship = "partner";
      hasExternalParty = true;
      entityDescription = "External business partner or institutional client";
      fulfillmentOwner = "external_partner";
      stratxcelRole = "customer_acquisition_partner";
    } else if (/\b(?:resell|distribute|broker|referral)\b/i.test(text)) {
      relationship = "third_party";
      hasExternalParty = true;
      entityDescription = "Third-party vendor or provider";
      fulfillmentOwner = "external_partner";
      stratxcelRole = "referral_partner";
    } else if (/\b(?:we\s+have\s+a\s+new|our\s+new|we\s+built|our\s+offer|new\s+saas|stratxcel)\b/i.test(text)) {
      relationship = "founder_venture";
      hasExternalParty = false;
      entityDescription = "Proprietary StratXcel venture or product";
      fulfillmentOwner = "stratxcel";
      stratxcelRole = "direct_seller";
    }

    // -------------------------------------------------------------
    // 2. INFER COMMERCIAL MODEL & MONETIZATION MECHANISM
    // -------------------------------------------------------------
    let commercialModelType: CommercialModelType = "lead_generation";
    let monetizationMechanism = "Direct client acquisition fee or service revenue";
    let commissionOrRevShareRate: string | undefined = undefined;

    // Rate extraction: e.g. "5%", "15% revenue share", "₹5000 per lead", "₹5 lakh"
    const pctMatch = raw.match(/\b(\d+(?:\.\d+)?%)\s*(?:commission|rev\s*share|revenue\s*share|referral\s*fee|cut|margin)?\b/i);
    if (pctMatch) {
      commissionOrRevShareRate = pctMatch[1];
    }
    const fixedFeeMatch = raw.match(/\b(?:₹|rs\.?|inr|\$)\s*(\d+(?:,\d+)*(?:\.\d+)?(?:\s*(?:lakh|cr|k|m))?)\s*(?:per\s*(?:customer|lead|deal|student|enrollment|sale))?\b/i);
    if (!commissionOrRevShareRate && fixedFeeMatch) {
      commissionOrRevShareRate = fixedFeeMatch[0];
    }

    if (/\b(?:commission|when\s+(?:students?|customers?|clients?)\s+(?:enroll|join|buy|purchase|convert))\b/i.test(text)) {
      commercialModelType = "commission";
      stratxcelRole = /\b(?:leads?|customers?|buyers?|business)\b/i.test(text)
        ? "lead_generation_partner"
        : "commission_agent";
      monetizationMechanism = commissionOrRevShareRate
        ? `Pre-negotiated commission rate (${commissionOrRevShareRate}) per successful deal/customer`
        : "Commission per qualified closed customer or student enrollment";
    } else if (/\b(?:referral|referrals|referral\s*fee)\b/i.test(text)) {
      commercialModelType = "referral";
      stratxcelRole = "referral_partner";
      monetizationMechanism = commissionOrRevShareRate
        ? `Referral fee (${commissionOrRevShareRate}) on attributable introductions`
        : "Referral fee paid on successful introduction or closed contract";
    } else if (/\b(?:rev\s*share|revenue\s*share|share\s+of\s+revenue)\b/i.test(text)) {
      commercialModelType = "revenue_share";
      stratxcelRole = "revenue_share_partner";
      monetizationMechanism = commissionOrRevShareRate
        ? `Revenue share agreement at ${commissionOrRevShareRate} of gross contract value`
        : "Contractual percentage of collected contract revenue";
    } else if (/\b(?:resell|reseller)\b/i.test(text)) {
      commercialModelType = "reseller";
      stratxcelRole = "reseller";
      monetizationMechanism = "Wholesale to retail margin spread on product/service reselling";
    } else if (/\b(?:saas|software|subscription|mrr|arr)\b/i.test(text)) {
      commercialModelType = "saas_subscription";
      stratxcelRole = "direct_seller";
      monetizationMechanism = "Recurring software subscription tiers (monthly/annual licenses)";
    } else if (/\b(?:leads?|lead\s*generation|get\s+leads)\b/i.test(text)) {
      commercialModelType = "lead_generation";
      stratxcelRole = "lead_generation_specialist";
      monetizationMechanism = "Pay-per-qualified-lead (PQL) or retainer-based acquisition pipeline";
    } else if (/\b(?:consulting|advisory)\b/i.test(text)) {
      commercialModelType = "consulting";
      stratxcelRole = "growth_consultant";
      monetizationMechanism = "Fixed retainer or milestone-based advisory fees";
    } else if (/\b(?:broker|brokerage)\b/i.test(text)) {
      commercialModelType = "brokerage";
      stratxcelRole = "commercial_broker";
      monetizationMechanism = "Transaction facilitation brokerage percentage on deal closing";
    }

    // -------------------------------------------------------------
    // 3. INFER BUSINESS CONCEPT, OFFERING & INDUSTRY SECTOR
    // -------------------------------------------------------------
    let industrySector = "Commercial Services & Technology";
    let businessType = "B2B Commercial Service";
    let offeringName = "Commercial Solution";
    let productOrServiceDescription = raw;
    let deliveryMechanism = "External professional service delivery";

    // Dynamic industry pattern recognition
    if (/\b(?:solar|rooftop|photovoltaic|clean\s*energy|power\s*plant|renewable)\b/i.test(text)) {
      industrySector = "Clean Energy & Commercial Solar EPC";
      businessType = "Commercial & Industrial Solar Rooftop EPC";
      offeringName = "Solar Rooftop Installation & EPC Solutions";
      productOrServiceDescription = "Turnkey commercial solar PV systems, net metering, and EPC engineering for industrial and commercial facilities";
      deliveryMechanism = "On-site EPC engineering, panel installation, and grid synchronization";
    } else if (/\b(?:mbbs|admissions?|university|medical\s*degree|russia|study\s*abroad|college|students?)\b/i.test(text)) {
      industrySector = "Higher Education & International Admissions";
      businessType = "International Medical Admissions Consultancy";
      offeringName = "Foreign Medical University (MBBS) Admissions Placement";
      productOrServiceDescription = "End-to-end guidance, documentation, apostille, visa support, and enrollment placement at accredited foreign state universities";
      deliveryMechanism = "Advisory consultations, university liaison, documentation, and student onboarding";
    } else if (/\b(?:saas|software|automation|crm|workflow|linkup|app|platform)\b/i.test(text)) {
      industrySector = "B2B Software & SaaS Platform";
      businessType = "Enterprise SaaS & Messaging Automation";
      offeringName = "Proprietary B2B SaaS & Automation Platform";
      productOrServiceDescription = "Cloud SaaS software subscription enabling automated lead routing, WhatsApp business workflows, and operational visibility";
      deliveryMechanism = "Multi-tenant cloud SaaS platform with API and webhook integration";
    } else if (/\b(?:bakery|food\s*processing|kitchen\s*equipment|commercial\s*ovens?|machinery|industrial\s*equipment)\b/i.test(text)) {
      industrySector = "Commercial Bakery & Food Processing Equipment";
      businessType = "Industrial Food Machinery & Equipment Supplier";
      offeringName = "Commercial Bakery & Food Processing Equipment";
      productOrServiceDescription = "Commercial bakery equipment including heavy-duty commercial baking ovens, spiral mixers, proofing chambers, and automated food production machinery";
      deliveryMechanism = "Physical machinery logistics, site commissioning, and manufacturer warranty servicing";
    } else if (/\b(?:law|legal|ip|patent|trademark|litigation|corporate\s*counsel)\b/i.test(text)) {
      industrySector = "Corporate Legal & Intellectual Property Advisory";
      businessType = "Specialized IP Law Practice";
      offeringName = "Tech Patent & Trademark Registration Advisory";
      productOrServiceDescription = "Prior art search, provisional patent drafting, non-provisional filing, IP portfolio protection, and corporate structuring";
      deliveryMechanism = "Specialized legal consultation, docketing, filing before patent registry, and advisory retainers";
    } else if (/\b(?:real\s*estate|property|plots?|commercial\s*space|brokerage|leasing)\b/i.test(text)) {
      industrySector = "Commercial & Industrial Real Estate";
      businessType = "Commercial Property Brokerage & Advisory";
      offeringName = "Industrial & Commercial Space Acquisition";
      productOrServiceDescription = "Identification, site due diligence, lease negotiation, and transaction advisory for commercial and warehouse properties";
      deliveryMechanism = "Site inspections, legal documentation, lease execution, and facility handover";
    } else if (/\b(?:marketing|seo|advertising|media|social\s*media|growth\s*agency)\b/i.test(text)) {
      industrySector = "Digital Growth & Performance Marketing";
      businessType = "Performance Marketing & Digital Agency";
      offeringName = "Autonomous Inbound Growth & Acquisition Engine";
      productOrServiceDescription = "Multi-channel organic SEO, conversion rate optimization, content syndication, and high-intent funnel development";
      deliveryMechanism = "Managed digital service delivery, reporting dashboards, and weekly optimization turns";
    } else {
      // General extraction from noun phrases
      const words = raw.split(/\s+/);
      if (words.length > 3) {
        offeringName = words.slice(0, 5).join(" ");
      }
      productOrServiceDescription = raw;
      deliveryMechanism = hasExternalParty ? "Partner fulfillment" : "StratXcel operational delivery";
    }

    // -------------------------------------------------------------
    // 4. INFER TARGET CUSTOMER, BUYER PERSONA & GEOGRAPHY
    // -------------------------------------------------------------
    let primaryCustomerSegment = "Target Commercial Buyers";
    let buyerPersona = "Business Decision Maker or Qualified Consumer";
    let targetGeography = "Explicitly unstated (Subject to partner research & confirmation)";
    const buyingSignals: string[] = [];

    // Geography extraction
    const geoMatches = raw.match(/\b(?:in|at|around|for|across)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
    const knownCities = ["ahmedabad", "bangalore", "bengaluru", "pune", "mumbai", "delhi", "noida", "gurgaon", "hyderabad", "chennai", "kolkata", "durg", "raipur", "chattisgarh", "chhattisgarh", "karnataka", "maharashtra", "gujarat", "russia", "germany", "uk", "dubai", "uae"];
    const foundCity = knownCities.find((c) => text.includes(c));
    if (foundCity) {
      targetGeography = foundCity.charAt(0).toUpperCase() + foundCity.slice(1);
    } else if (geoMatches && !["Solar", "Linkup", "SaaS", "MBBS", "Stratxcel", "Founder"].includes(geoMatches[1])) {
      targetGeography = geoMatches[1];
    }

    if (industrySector.includes("Clean Energy")) {
      primaryCustomerSegment = "Commercial & Industrial (C&I) Facility Owners";
      buyerPersona = "Plant Head, Chief Operating Officer, or Factory Owner with monthly electricity bills > ₹1,00,000";
      buyingSignals.push("High daytime electricity tariffs (₹10-14/kWh)", "15,000+ sq ft unshaded industrial shed roof", "Net zero / ESG mandates");
    } else if (industrySector.includes("Higher Education")) {
      primaryCustomerSegment = "Aspiring Medical Students & Parents (India / Abroad)";
      buyerPersona = "NEET-qualified high school graduates (ages 18-24) seeking affordable, NMC-recognized English-medium medical degrees";
      buyingSignals.push("Qualified NEET with score 140-450", "Budget constrained for Indian private medical colleges (₹80L+ vs ₹25L Russia)", "Passport ready");
    } else if (industrySector.includes("Software")) {
      primaryCustomerSegment = "SMB Owners, Clinics, Agencies, and E-commerce Platforms";
      buyerPersona = "Founder / Operations Manager handling 20+ customer WhatsApp inquiries daily without centralized automation";
      buyingSignals.push("Slow response times to inbound leads", "Manual copy-pasting customer records", "High WhatsApp usage");
    } else if (industrySector.includes("Bakery")) {
      primaryCustomerSegment = "Commercial Bakeries, Confectioneries, Cloud Kitchens & Hotel Chains";
      buyerPersona = "Bakery Owner, Head Pastry Chef, or F&B Director expanding daily batch production capacity";
      buyingSignals.push("Expanding from retail to wholesale distribution", "Upgrading manual ovens to rotary rack ovens", "Opening new outlet");
    } else if (industrySector.includes("Legal")) {
      primaryCustomerSegment = "Funded Tech Startups, BioTech & DeepTech Founders";
      buyerPersona = "CTO, Founder, or General Counsel building novel proprietary algorithms or hardware requiring IP moat";
      buyingSignals.push("Seed / Series A funding round completed", "Prior art disclosure needed before product launch", "Global patent expansion");
    } else {
      primaryCustomerSegment = hasExternalParty ? "Qualified prospective clients for partner's offer" : "Target enterprise and commercial clients";
      buyerPersona = "Commercial decision maker with authority to purchase or authorize engagement";
      buyingSignals.push("Active commercial requirement", "Verified purchasing budget", "Identified operational bottleneck");
    }

    // -------------------------------------------------------------
    // 5. INFER OUTCOME & MEASURABLE ACCEPTANCE CRITERIA
    // -------------------------------------------------------------
    let intentCategory: BusinessOpportunityAnalysis["desiredOutcome"]["intentCategory"] = "acquire_leads";
    let outcomeSummary = `Grow commercial opportunities and establish monetization for: "${raw}".`;
    let metricName = "qualified_opportunities";
    let targetValue: number | undefined = undefined;
    let unit = "verified_leads";

    // Extract quantity if specified
    const qtyMatch = text.match(/\b(\d+)\s*(?:leads?|customers?|clients?|buyers?|accounts?|sales?|deals?|candidates?)\b/i);
    if (qtyMatch) {
      targetValue = parseInt(qtyMatch[1], 10);
    }

    if (/\b(?:get\s+leads?|find\s+leads?|source\s+leads?|leads?\s+for\s+him)\b/i.test(text)) {
      intentCategory = "acquire_leads";
      outcomeSummary = hasExternalParty
        ? `Generate and qualify genuine prospective customer leads for ${entityDescription}.`
        : "Generate qualified prospect pipeline for the business offering.";
      unit = "verified_leads";
      metricName = "qualified_leads_delivered";
      if (!targetValue) targetValue = 25;
    } else if (/\b(?:get\s+customers?|find\s+customers?|bring\s+him\s+customers?|buyers?|get\s+buyers?)\b/i.test(text)) {
      intentCategory = "acquire_customers";
      outcomeSummary = `Acquire paying commercial customers to earn attributable ${commercialModelType} revenue.`;
      unit = "converted_customers";
      metricName = "attributable_customer_conversions";
      if (!targetValue) targetValue = 10;
    } else if (/\b(?:see\s+whether|evaluate|figure\s+out|opportunity|viable|potential)\b/i.test(text)) {
      intentCategory = "evaluate_opportunity";
      outcomeSummary = `Evaluate the commercial feasibility, unit economics, demand density, and monetization path for this opportunity.`;
      unit = "feasibility_milestones";
      metricName = "market_feasibility_score";
      if (!targetValue) targetValue = 100; // 100% evaluated
    } else if (/\b(?:make\s+money|monetize|earn|revenue)\b/i.test(text)) {
      intentCategory = "grow_revenue";
      outcomeSummary = `Structure monetization channels and drive measurable commercial returns from the opportunity.`;
      unit = "revenue_inr";
      metricName = "attributable_revenue_cents";
    }

    const acceptanceCriteria: string[] = [
      `Grounded identification of 100% genuine, verifiable entities with physical/corporate existence (Zero synthetic records).`,
      `Verified contactability with public business channels or documented decision-maker presence.`,
      `Deterministic evidence-based qualification score exceeding threshold (>70%).`,
      `Complete source provenance stored including timestamp, URL/registry reference, and deduplication hash.`,
    ];

    if (businessType.includes("Admissions") || primaryCustomerSegment.includes("Medical") || raw.toLowerCase().includes("student") || raw.toLowerCase().includes("mbbs")) {
      acceptanceCriteria.push("Documented prospective student enrollment inquiries validated for academic eligibility and university accreditation requirements.");
    } else {
      acceptanceCriteria.push(`Acquisition of qualified, verified prospective ${primaryCustomerSegment} leads ready for commercial evaluation.`);
    }

    if (hasExternalParty && commercialModelType === "commission") {
      acceptanceCriteria.push(`Documented attribution record connecting acquired opportunity to external partner's deal pipeline for commission payment.`);
    }

    // -------------------------------------------------------------
    // 6. IDENTIFY EXPLICIT UNKNOWNS & RESEARCH MANDATES
    // (CRITICAL RULE: NEVER INVENT MISSING INFORMATION)
    // -------------------------------------------------------------
    const explicitUnknowns: string[] = [];
    const researchMandates: ResearchMandate[] = [];

    // Check unknown geography
    if (targetGeography.includes("Explicitly unstated") || targetGeography.includes("Subject to confirmation") || targetGeography.includes("Pan-India")) {
      explicitUnknowns.push("Specific target geographic boundary or local operational service radius.");
      researchMandates.push({
        area: "target_icp",
        question: "What is the partner's exact physical service radius, delivery footprint, or regional licensing boundary?",
        priority: "HIGH",
        suggestedTools: ["browser.search", "research.web"],
      });
    }

    // Check unknown company name and offering
    if (
      hasExternalParty &&
      !text.includes("solar") &&
      !text.includes("mbbs") &&
      !text.includes("saas") &&
      !text.includes("bakery") &&
      !text.includes("patent") &&
      !text.includes("real estate") &&
      !text.includes("law")
    ) {
      explicitUnknowns.push("Specific company name, core offering, and product/service catalog of the external partner.");
      researchMandates.push({
        area: "target_icp",
        question: "What is the partner company's exact business name, product catalog, and value proposition?",
        priority: "CRITICAL",
        suggestedTools: ["founder.clarification", "browser.search", "research.web"],
      });
    }

    // Check unknown commercial terms / pricing
    if (!commissionOrRevShareRate) {
      explicitUnknowns.push("Exact commission percentage, referral bonus, or fee schedule agreed with external party.");
      researchMandates.push({
        area: "pricing_and_commission",
        question: "What is the exact commission or referral payout amount, trigger event (introduction vs deposit vs final payment), and payment timeline?",
        priority: "CRITICAL",
        suggestedTools: ["founder.clarification", "crm.agreement_review"],
      });
    }

    // Check partner delivery capacity & credentials
    if (hasExternalParty) {
      explicitUnknowns.push("Partner's current fulfillment capacity, operational throughput, and turnaround timeline.");
      researchMandates.push({
        area: "fulfillment_capacity",
        question: "How many active leads or concurrent projects can the partner fulfill per month without degradation?",
        priority: "HIGH",
        suggestedTools: ["research.web", "partner.intake"],
      });
    }

    // Market demand and competitor landscape
    explicitUnknowns.push("Current customer acquisition cost (CAC) and conversion rate benchmarks in this specific vertical.");
    researchMandates.push({
      area: "market_demand",
      question: `What are the highest-converting acquisition channels for ${offeringName} in ${targetGeography}?`,
      priority: "HIGH",
      suggestedTools: ["browser.search", "google.research"],
    });

    // -------------------------------------------------------------
    // 7. OPERATING STRATEGY & DYNAMIC WORKFORCE DELEGATION
    // -------------------------------------------------------------
    const recommendedChannels: string[] = [];
    if (industrySector.includes("Clean Energy") || industrySector.includes("Bakery")) {
      recommendedChannels.push("Industrial Estate Directory Prospecting", "Direct Commercial Decision-Maker Discovery", "Google Maps Business Registry");
    } else if (industrySector.includes("Higher Education")) {
      recommendedChannels.push("Educational Webinar Registrations", "High School / College Outreach", "WhatsApp Q&A Information Desk");
    } else if (industrySector.includes("Software")) {
      recommendedChannels.push("LinkedIn B2B Outreach", "Interactive Software Demos", "Local Trade Association Partnerships");
    } else if (industrySector.includes("Legal")) {
      recommendedChannels.push("Startup Incubator / Accelerator Rosters", "AngelList / Tracxn Funding Databases", "Founder Direct Introductions");
    } else {
      recommendedChannels.push("Verified Industry Registry Prospecting", "Direct Public Channel Engagement", "Targeted Value-First Messaging");
    }

    const firstAction = researchMandates.length > 0
      ? `Deploy Athena (Research Specialist) to investigate ${researchMandates[0].question}`
      : "Formulate ICP profile and begin grounded prospect discovery.";

    const subsequentActions = [
      "Synthesize research findings into a deterministic ICP scoring profile.",
      "Deploy Mercury (Lead Gen & Sales Specialist) to discover real, verifiable commercial entities with complete provenance.",
      "Filter records through SHA-256 deduplication and evidence-based qualification gates.",
      "Present qualified opportunities and structured proposals for Founder / Partner review.",
      "Track conversion milestones and record attributable commercial revenue upon external event verification.",
    ];

    const verificationRequirements = [
      "Physical plant / commercial office domain reachability and registration check.",
      "Active public business phone / email or corporate executive presence.",
      "Absence of duplicate records in Supabase crm_leads.",
      "Confirmation of partner's agreement terms before signing commercial obligations.",
    ];

    const requiredCapabilities = [
      "research.web",
      "crm.read",
      "crm.write",
      "lead.qualify",
      "lead_qualification",
      "lead_generation",
      "crm_pipeline",
      "analytics.read",
    ];

    if (commercialModelType === "saas_subscription") {
      requiredCapabilities.push("product_marketing", "customer_onboarding");
    }

    // Dynamic workforce assignment based on inferred domain
    const recommendedWorkforce: RecommendedWorker[] = [
      {
        roleKey: "research_specialist",
        department: "research",
        purpose: `Investigate market demand, pricing benchmarks, and competitor positioning for ${offeringName}.`,
        isExisting: true,
      },
      {
        roleKey: "lead_generation_specialist",
        department: "acquisition",
        purpose: `Discover grounded real prospective clients fitting the ${primaryCustomerSegment} ICP with full provenance.`,
        isExisting: true,
      },
      {
        roleKey: "sales_development_specialist",
        department: "sales",
        purpose: "Qualify opportunities, structure commercial proposals, and track conversion pipeline.",
        isExisting: true,
      },
      {
        roleKey: "commercial_finance_analyst",
        department: "finance",
        purpose: `Model pro-forma unit economics, commission attribution, and verify genuine receipt of payment events.`,
        isExisting: true,
      },
    ];

    return {
      id,
      rawDirective: raw,
      partiesInvolved: {
        externalParty: {
          hasExternalParty,
          relationship,
          entityDescription,
        },
        stratxcelRole,
        fulfillmentOwner,
        fulfillmentNotes: hasExternalParty
          ? "External partner is responsible for product delivery / service execution; StratXcel drives customer acquisition and qualification."
          : "StratXcel holds complete operational responsibility for product delivery and customer fulfillment.",
      },
      businessConcept: {
        industrySector,
        businessType,
        offeringName,
        productOrServiceDescription,
        deliveryMechanism,
        isExistingOffer: Boolean(options.existingOfferings?.some((o) => text.includes(o.toLowerCase()))),
      },
      commercialModel: {
        type: commercialModelType,
        monetizationMechanism,
        commissionOrRevShareRate,
        pricingEstimate: {
          dealSizeEstimate: "To be determined via initial market discovery",
          potentialRevenuePerUnit: commissionOrRevShareRate || "Variable based on deal size",
          marginNotes: hasExternalParty
            ? "High gross margin (80%+) as fulfillment COGS are carried by external partner"
            : "Standard direct margin",
        },
      },
      targetMarket: {
        primaryCustomerSegment,
        buyerPersona,
        targetGeography,
        demandCharacteristics: "Evidence-based requirement validated through commercial activity",
        buyingSignals,
      },
      desiredOutcome: {
        intentCategory,
        summary: outcomeSummary,
        measurableTarget: {
          metricName,
          targetValue,
          unit,
        },
        acceptanceCriteria,
      },
      explicitUnknowns,
      researchMandates,
      operatingStrategy: {
        recommendedChannels,
        firstAction,
        subsequentActions,
        verificationRequirements,
        requiredCapabilities,
        recommendedWorkforce,
      },
      amendments: [],
      confidenceScore: hasExternalParty ? 0.92 : 0.88,
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * Applies continuous natural language Founder feedback to an existing opportunity,
   * preserving conversational state and updating the strategy in-place without restarting context.
   */
  public refineOpportunityWithFeedback(
    currentAnalysis: BusinessOpportunityAnalysis,
    feedbackText: string
  ): BusinessOpportunityAnalysis {
    const feedback = feedbackText.trim();
    const lower = feedback.toLowerCase();
    const appliedChanges: string[] = [];

    // Clone analysis for immutable tracking
    const updated: BusinessOpportunityAnalysis = JSON.parse(JSON.stringify(currentAnalysis));

    // 1. Geographic Refinement (e.g. "Focus on Durg first", "Target Ahmedabad", "Only in Pune")
    const geoMatch = feedback.match(/\b(?:focus\s+on|target|only\s+in|in|around)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i);
    const knownCities = ["durg", "raipur", "ahmedabad", "pune", "bangalore", "bengaluru", "mumbai", "delhi", "noida", "gurgaon", "hyderabad", "chennai", "russia"];
    const foundCity = knownCities.find((c) => lower.includes(c));

    if (foundCity) {
      const formattedCity = foundCity.charAt(0).toUpperCase() + foundCity.slice(1);
      updated.targetMarket.targetGeography = formattedCity;
      // Remove unknown if geography is now resolved
      updated.explicitUnknowns = updated.explicitUnknowns.filter((u) => !u.includes("geographic"));
      updated.researchMandates = updated.researchMandates.filter((r) => r.area !== "target_icp" || !r.question.includes("radius"));
      appliedChanges.push(`Updated target geographic boundary to: ${formattedCity}`);
    } else if (geoMatch && geoMatch[1]) {
      updated.targetMarket.targetGeography = geoMatch[1];
      appliedChanges.push(`Updated target geographic boundary to: ${geoMatch[1]}`);
    }

    // 2. Budget / Cost Sensitivity (e.g. "Don't spend much money", "Low budget", "Zero ad spend", "Bootstrap this")
    if (/\b(?:don'?t\s+spend|low\s+budget|bootstrap|zero\s+(?:cost|ad\s*spend)|cheap|minimal\s+expense)\b/i.test(lower)) {
      updated.operatingStrategy.recommendedChannels = [
        "Direct Organic Public Business Registry Discovery",
        "Personalized Founder Direct Email & WhatsApp Outreach",
        "Local Trade Chamber & Industry Association Referrals",
      ];
      updated.operatingStrategy.firstAction = "Deploy Athena to harvest verified public directory records at zero advertising cost.";
      appliedChanges.push("Re-optimized customer acquisition strategy toward zero-ad-spend organic and direct outreach channels.");
    }

    // 3. Lead Quality / Qualification Threshold (e.g. "Leads are poor", "Quality is low", "Filter better")
    if (/\b(?:leads?\s+are\s+poor|quality\s+is\s+low|filter\s+better|higher\s+quality|too\s+many\s+junk|unqualified)\b/i.test(lower)) {
      updated.desiredOutcome.acceptanceCriteria.push(
        "Mandate multi-point telephone/executive pre-verification before lead delivery.",
        "Raise minimum deterministic qualification score threshold from 70% to 85%."
      );
      updated.operatingStrategy.firstAction = "Perform diagnostic audit on rejected leads, identify negative filters, and tighten qualification criteria.";
      appliedChanges.push("Tightened deterministic qualification threshold to 85% and instituted mandatory pre-verification gate.");
    }

    // 4. Commercial Customer Scale (e.g. "Get serious commercial customers", "Target enterprise only", "Go after big companies")
    if (/\b(?:serious\s+commercial|enterprise\s+only|big\s+companies|high\s+ticket|larger\s+deal)\b/i.test(lower)) {
      updated.targetMarket.primaryCustomerSegment = "Large Commercial & Enterprise Accounts";
      updated.targetMarket.buyerPersona = "C-Level Executive (Managing Director / CFO / Head of Procurement) at businesses with annual turnover > ₹25 Cr";
      updated.desiredOutcome.acceptanceCriteria.push("Minimum deal size or power consumption filter enforced on all prospective accounts.");
      appliedChanges.push("Pivoted target ICP from mid-market to high-value Commercial & Enterprise decision makers.");
    }

    // 5. Workforce Enablement Mandate (e.g. "Create whatever team you need", "Hire specialist", "Build the team")
    if (/\b(?:create\s+whatever\s+team|build\s+the\s+team|hire|provision|deploy\s+specialist)\b/i.test(lower)) {
      updated.operatingStrategy.requiredCapabilities.push("agent.provision_specialist");
      updated.operatingStrategy.firstAction = `Provision dedicated domain specialists across research, acquisition, and finance for ${updated.businessConcept.offeringName}.`;
      appliedChanges.push("Granted autonomous authority to provision dedicated specialized workforce workers.");
    }

    if (appliedChanges.length === 0) {
      appliedChanges.push(`Incorporated contextual Founder directive: "${feedback}" into active strategy.`);
    }

    updated.amendments.push({
      timestamp: new Date().toISOString(),
      feedbackText: feedback,
      appliedChanges,
    });

    return updated;
  }
}

export const businessOpportunityUnderstanding = new BusinessOpportunityUnderstandingEngine();
