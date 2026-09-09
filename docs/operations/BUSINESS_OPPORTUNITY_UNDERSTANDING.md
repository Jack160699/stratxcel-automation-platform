# BUSINESS OPPORTUNITY UNDERSTANDING ENGINE (HERMES CEO)

## StratXcel Autonomous Operating Company Architecture

---

### Executive Overview

The **Business Opportunity Understanding Engine** (`BusinessOpportunityUnderstandingEngine`) is a core, reusable capability of the Hermes Autonomous CEO OS.

It eliminates hardcoded business playbooks (`if (solar)`, `if (mbbs)`, `if (saas)`) and allows the Founder to speak naturally without being forced to specify:
- ICP (Ideal Customer Profile)
- Target market or geographic boundary
- Lead sources or directories
- Website structure or CTA
- Outreach channels
- Agents or departments
- APIs, tools, or webhooks
- Sales process or cadence
- Follow-up logic
- Payment methods or billing setup
- Fulfillment process
- KPIs or metrics
- Next best actions

**The Founder provides natural business intent. Hermes provides understanding, determines the plan, builds what is missing, executes, measures real-world outcomes, learns, and continues.**

---

### The 16 Canonical Inferences

From informal Founder statements, Hermes autonomously infers:

| # | Dimension | Hermes CEO Autonomous Inference | Unknown Handling |
|---|---|---|---|
| **1** | **Who is involved?** | Distinguishes external friend/partner, vendor, founder venture, or internal StratXcel venture. | If external party is unstated, marked as internal or flagged for clarification. |
| **2** | **What is the business?** | Identifies the commercial sector, industry archetype, and operational domain. | Preserved as unknown if completely ambiguous; triggers research. |
| **3** | **What is being sold?** | Extracts the physical product, professional service, software license, or EPC project. | Never invented; marked as explicit unknown if vague. |
| **4** | **Who is the customer?** | Determines primary B2B/B2C segment, buyer persona, and buying triggers. | Defaults to broad commercial category; triggers ICP research. |
| **5** | **Who delivers fulfillment?** | Establishes fulfillment owner (`external_partner`, `stratxcel`, or `joint`). | Defaults to `external_partner` when a partner/friend is mentioned. |
| **6** | **How does StratXcel make money?** | Discovers revenue mechanism: commission %, referral fee, rev share %, SaaS margin. | If rate is unstated, flagged as critical commercial unknown. |
| **7** | **What is our role?** | Determines StratXcel's position: `customer_acquisition_partner`, `referral_partner`, etc. | Derived from commercial model and operational verbs. |
| **8** | **Commercial Model** | Classifies into 15+ recognized models: referral, commission, reseller, SaaS, rev share. | Dynamic classification without hardcoded if-statements. |
| **9** | **Desired Outcome** | Maps Founder intent to measurable business goals: `acquire_leads`, `grow_revenue`, etc. | Defaults to qualified opportunities and discovery. |
| **10** | **Relevant Market** | Infers industry sector (e.g., Clean Energy, Industrial Bakery, IP Law, EdTech). | Derived from product context. |
| **11** | **Customer Segments** | Outlines target enterprise, commercial, or institutional decision-makers. | Tailored to domain buying signals. |
| **12** | **Required Capabilities** | Maps requirements to system capabilities (`research.web`, `crm.write`, `lead_generation`). | Missing capabilities trigger engineering workers. |
| **13** | **What should happen first?** | Sets `firstAction` (investigate unknowns, research ICP, or market audit). | Always prioritizes evidence gathering. |
| **14** | **What should happen next?** | Generates sequential `subsequentActions` through acquisition, sales, and attribution. | Structured execution stages. |
| **15** | **What must be verified?** | Identifies compliance, domain authenticity, duplicate avoidance, and commercial terms. | Enforces strict verification gates. |
| **16** | **What is unknown?** | Explicitly captures missing information as `explicitUnknowns` with `researchMandates`. | **NEVER hallucinated or invented.** |

---

### Commercial Models Recognized

The engine generalizes across commercial relationships:
1. **Commission**: Performance compensation per successful closed customer or student enrollment.
2. **Referral**: One-time or milestone-based referral fee on qualified introduction.
3. **Revenue Share**: Contractual percentage of gross customer billing over time.
4. **Lead Generation**: Pay-per-qualified-lead (PQL) or structured acquisition pipeline.
5. **Reseller**: Wholesale purchase to retail margin spread.
6. **Agency / Service Delivery**: Retainer or project-based operational execution.
7. **SaaS / Subscription**: Recurring software licenses (MRR/ARR).
8. **Consulting / Advisory**: Strategic milestone retainers.
9. **Brokerage / Transaction Facilitation**: Transaction percentage on commercial closing.
10. **Performance-Based Compensation**: Milestones tied strictly to external attributable events.

---

### Handling Unknowns & Research Mandates

A critical rule of Hermes is: **NEVER INVENT MISSING INFORMATION.**

If the Founder says:
> *"My friend started a business. We can earn from referrals. See whether there is an opportunity."*

Hermes does **not** assume the business is solar, software, or admissions. Instead:
- `explicitUnknowns`:
  - Specific external company name and core product/service offering.
  - Target geographic operational radius.
  - Fee schedule and referral trigger terms.
  - Partner fulfillment capacity.
- `researchMandates`:
  - `target_icp`: *"What is the partner company's exact business name, product catalog, and value proposition?"*
  - `pricing_and_commission`: *"What is the exact commission or referral payout amount and trigger event?"*
  - `fulfillment_capacity`: *"How many active leads or concurrent projects can the partner fulfill per month?"*

---

### Grounded Lead Discovery (Zero Synthetic Data)

Once an opportunity is formulated, Hermes executes real-world prospect discovery with strict provenance:
- **Commercial Solar EPC**: Verifiable industrial sheds, manufacturing plants in Peenya/Bangalore industrial hubs.
- **Higher Education Admissions**: Real accredited foreign state universities (Pavlov State Medical, Kazan Federal).
- **Commercial Bakery Equipment**: Verified large-scale commercial bakeries in Ahmedabad/Gujarat (Monginis Foods, Havmor Ice Cream, Gwalia Sweets, Vadilal Industries).
- **Corporate IP Law**: Real engineering and cloud startups in Pune (Druva Software, Icertis, Rebel Foods, Altizon Systems).

Every prospect record is backed by:
1. `sourceUrl` and public business channel.
2. Discovery timestamp (`ISO 8601`).
3. SHA-256 deduplication hash against live Supabase `crm_leads`.
4. Deterministic qualification score (≥70%).
5. **Strict Revenue Truth**: Closed revenue remains ₹0 until verified by external payment confirmation.

---

### Conversational State Refinement

Hermes maintains persistent objective ownership across multi-turn Founder dialogue without restarting context:

| Founder Follow-up | Hermes In-Place Refinement |
|---|---|
| *"Focus on Durg first."* | Updates `targetMarket.targetGeography` to "Durg", prunes geographic unknowns, re-filters acquisition queries. |
| *"Don't spend much money."* | Re-optimizes acquisition strategy to zero-ad-spend direct public directory discovery and founder outreach. |
| *"Leads are poor."* | Tightens deterministic qualification threshold from 70% to 85%, institutes mandatory pre-verification gate. |
| *"Get serious commercial customers."* | Pivots target ICP from mid-market to high-value Commercial & Enterprise decision-makers. |
| *"Create whatever team you need."* | Grants autonomous authority to provision dedicated specialized workforce workers (`agent.provision_specialist`). |

---

### Verification and Test Coverage

The engine is verified against 12 end-to-end automated test suites (`scripts/test-business-opportunity-understanding.mjs`):
- ✅ Canonical Solar Commission Partnership
- ✅ Russia MBBS Admissions Partnership
- ✅ Internal SaaS Product Monetization
- ✅ Referral Business with Unknown Details & Research Mandates
- ✅ Customer Acquisition Partner Intent ("Take care of it")
- ✅ High Ambiguity Statement Preserving Unknowns
- ✅ Unseen Vertical 1: Commercial Bakery Equipment in Ahmedabad (5% referral)
- ✅ Unseen Vertical 2: Corporate IP Law Firm in Pune (15% rev share)
- ✅ Grounded Lead Discovery for Unseen Verticals with Public Provenance
- ✅ Multi-Turn Conversational State Refinement
- ✅ End-to-End Autonomous Execution via `hermesExecutiveBrain`
- ✅ Intent Decomposer Natural Language Routing
