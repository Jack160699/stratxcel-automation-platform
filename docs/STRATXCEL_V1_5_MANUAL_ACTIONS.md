# StratXcel V1.5 Manual Actions & Engineering Roadmap

**Date**: 2026-08-16  
**Auditor**: StratXcel Product & Engineering Auditor  

---

## Section A: Manual Actions Now (Immediate Operational Setup)

| Action | Why It Matters | Exact Location / Steps | Owner | Priority | Dependency | Blocking Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **A1. Razorpay Live Webhook Configuration** | Required for server-to-server payment state reconciliation. | Add webhook endpoint `https://www.stratxcel.in/api/webhook/razorpay` with secret `RAZORPAY_WEBHOOK_SECRET` in Razorpay Dashboard. | Admin / Ops | **P0** | Live merchant account | **Non-blocking for staging; P0 for live revenue** |
| **A2. WhatsApp Business Phone Number Registration** | Connects official StratXcel WhatsApp sender. | Verify phone number in Meta Business Manager WhatsApp Accounts tab; copy Phone Number ID and Access Token to environment. | Admin / Ops | **P1** | Meta Business Account | **Non-blocking for development/test mock** |
| **A3. Hermes EC2 Gateway Health Check Verification** | Connects upstream NousResearch/hermes-agent v0.20.0 to private MCP bridge. | Run `scripts/hermes-health` or verify systemd service on EC2 `172.31.4.241:8642`. | DevOps / Lead | **P1** | Private VPC networking | **Non-blocking (mock adapter available for fallback)** |

---

## Section B: External Provider Actions

| Action | Provider | Required Work | Owner | Priority |
| :--- | :--- | :--- | :--- | :--- |
| **B1. Meta App Review Submission** | Meta | Record screencast of Social Autopilot UI in `app/app/social/copilot`; submit permissions `pages_manage_posts`, `instagram_business_content_publish`. | Operations | **P1** |
| **B2. Google OAuth Verification** | Google | Submit OAuth consent screen verification for `webmasters.readonly` and `analytics.readonly`. | Tech Lead | **P1** |
| **B3. WhatsApp Message Templates Approval** | Meta | Submit message templates for Audit delivery and 26th monthly report. | Operations | **P1** |
| **B4. Google Business Profile API Access** | Google | Submit access request form for Google My Business API write endpoints. | Operations | **P2** |

---

## Section C: Product Decisions Required

1. **Customized Plan Add-on Boundaries**: Should customers be allowed to add individual micro-services (e.g. +2 extra blog posts for ₹999) without upgrading the entire tier from Standard to Premium?
   - *Current Implementation*: Clean Standard vs Premium tiers with fixed modular scope; customization recalculates total price deterministically.
2. **Paid Ad Budget Handling**: When customers order Paid Advertising, should ad spend budget be charged through StratXcel wallet or paid directly by customer to Meta/Google Ad accounts?
   - *Current Implementation*: Ad management & creative service fee charged in subscription; actual ad spend billed directly to customer's linked ad account for transparent zero-markup billing.

---

## Section D: Major Engineering Work (V2 Horizon)

1. **Direct POS & Inventory Sync (V2)**: Integration with Shopify POS, Petpooja, and Zoho Books for automated real-time retail inventory synchronization.
2. **Autonomous Meta Ads Bid Optimization Engine (V2)**: Programmatic bidding algorithm adjusting budgets based on daily CPA and ROAS signals via Meta Marketing API v21.0.
3. **Voice AI Inbound Phone Reception (V2)**: Integration of Twilio/Exotel with Hermes voice streaming for 24/7 autonomous phone answering.

---

## Section E: Post-V1 Enhancements

1. Mobile companion progressive web app (PWA) push notifications for instant campaign approvals.
2. Multi-language regional Indian vernacular WhatsApp prompts (Hindi, Marathi, Gujarati, Tamil, Telugu).
