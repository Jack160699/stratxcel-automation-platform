# StratXcel Missing Real Connections & Remediation Checklist

**Document Purpose**: Identifies connection gaps, missing assets, and exact manual actions required to enable full dogfood operations for StratXcel.  
**Date**: 2026-08-16  
**Auditor**: StratXcel Autonomous Growth OS Product & Engineering Auditor  

---

## Group A: Already Connected & Verified

1. **StratXcel Canonical Website** (`https://www.stratxcel.in`):
   - Status: **LIVE (HTTP 200 OK)**
   - Capabilities: Crawling, JSON-LD Schema extraction, SEO audit, SSRF protection, Brand Brain ingestion.
2. **Supabase Database & Auth**:
   - Status: **LIVE (`uccqlgeghkwzujeeymua`)**
   - Capabilities: Multi-tenant data storage, RLS enforcement, user sessions, audit logs, value ledger.
3. **AI Runtime (Gemini, OpenAI, OpenRouter)**:
   - Status: **LIVE & TESTED**
   - Capabilities: Multi-model tier routing, structured JSON outputs, usage token accounting.
4. **Hermes Mission Control & Workforce Core**:
   - Status: **LIVE & TESTED**
   - Capabilities: 21 canonical specialist agents, 25 Workforce execution departments, DAG planning.

---

## Group B: Connected But Needs Operational Repair

- **None**: All existing code paths, schemas, and API adapters have zero unresolved syntax errors or broken table relations.

---

## Group C: Not Connected (Requires Owner Credential Input)

| Connection | Why It Is Needed | V1.5 Subsystem Dependent | Required Owner Action | Expected Permissions |
| :--- | :--- | :--- | :--- | :--- |
| **Google Search Console & GA4 Live Binding** | Enables live pull of organic clicks, impressions, and GA4 user sessions. | SEO & Analytics Intelligence | Visit `https://www.stratxcel.in/app/integrations`, click "Connect Google Search & GA4", select StratXcel Google Account. | `webmasters.readonly`, `analytics.readonly` |
| **Meta (Facebook & Instagram) Live Binding** | Enables live scheduling of social content and pulling engagement metrics. | Social Autopilot & Content Studio | Visit `https://www.stratxcel.in/app/integrations`, click "Connect Instagram / Facebook", grant page manage permissions. | `pages_manage_posts`, `instagram_business_content_publish` |
| **WhatsApp Business Live Number Binding** | Connects live customer notifications and WhatsApp Copilot chat. | Customer Copilot & Value Reports | In `/admin/platform/whatsapp`, configure Phone Number ID and WABA ID; flip status to `active`. | WhatsApp Cloud API v20.0 message send/receive |
| **Razorpay Live Webhook Registration** | Connects live customer subscription activation and payment receipt logging. | Subscriptions & Plan Engine | In Razorpay Dashboard, set Webhook URL `https://www.stratxcel.in/api/webhook/razorpay` with `RAZORPAY_WEBHOOK_SECRET`. | `payment.captured`, `subscription.charged` |

---

## Group D: Provider Blocked (Awaiting External Partner Approval)

1. **Meta App Review for Public Live Publishing**:
   - *Why*: Meta requires business verification and screencast review before third-party app tokens can publish to arbitrary non-tester Instagram/Facebook accounts.
   - *Workaround during Dogfood*: StratXcel's own Instagram/Facebook account can be added as a Tester/Admin in the Meta Developer App to enable 100% unrestricted live publishing for the dogfood test immediately without waiting for global App Review.
2. **Google Cloud OAuth Consent Screen Verification**:
   - *Why*: Unverified Google apps display a warning screen during initial OAuth consent.
   - *Workaround during Dogfood*: Admin clicks "Advanced $\to$ Proceed to StratXcel (unsafe)" once during initial dogfood setup.

---

## Group E: Not Required for V1.5 Dogfood Launch

- **Google Drive Storage Vault (BYOS)**: StratXcel uses Supabase Storage for default asset storage; external Google Drive vault is optional.
- **TikTok & Pinterest Connectors**: Out of scope for V1.5 core B2B growth engine.

---

## Group F: Future V2 Integrations

1. **Direct POS & Inventory Synchronization** (Shopify, Petpooja, Zoho Books).
2. **Autonomous Paid Ad Bid Optimization Engine** (Meta Marketing API & Google Ads API write tokens).
3. **Voice AI Inbound Telephony** (Twilio/Exotel with Hermes streaming).

---

## Checklist: 4 Steps to Dogfood Launch

- [ ] **Step 1**: Open `https://www.stratxcel.in/app/integrations` and link the official StratXcel Google Search Console property.
- [ ] **Step 2**: Open `https://www.stratxcel.in/app/integrations` and link the official StratXcel Instagram & Facebook pages.
- [ ] **Step 3**: Configure `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_TOKEN` in the production environment.
- [ ] **Step 4**: Trigger the initial StratXcel Autonomous Dogfood Audit via `/app/audit`.
