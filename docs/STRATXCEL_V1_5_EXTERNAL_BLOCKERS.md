# StratXcel V1.5 External Provider & App Review Blockers

**Date**: 2026-08-16  
**Auditor**: StratXcel Autonomous Growth OS Product & Engineering Auditor  
**Purpose**: Exhaustive catalog of third-party partner approvals, API access requests, and external developer verifications required for full unconstrained production live operation.

---

## 1. External Blocker Matrix

| Blocker ID | External Provider | Feature Impacted | Code Status | Exact Manual / External Action Required | Owner | Priority | Expected Outcome |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **BLK-01** | **Meta (Facebook & Instagram)** | Direct Autonomous Social Publishing & Comment Management | **Code Complete** in `lib/social/providers/facebook.ts` and `instagram.ts`. | Submit Meta App for Review with permissions: `pages_manage_posts`, `pages_read_engagement`, `instagram_business_content_publish`, `instagram_business_manage_comments`. Submit recorded UI screencast and business verification. | Operations / Legal | **P1** | Live token exchange and direct publishing enabled for all customer Instagram/Facebook accounts without sandbox limits. |
| **BLK-02** | **Google Cloud Platform** | Search Console, GA4 & YouTube Publishing | **Code Complete** in `packages/search-discovery/src/google/oauth.ts` and `lib/social/providers/youtube.ts`. | Complete Google Cloud OAuth Consent Screen verification for sensitive scopes (`webmasters.readonly`, `analytics.readonly`, `youtube.upload`). Submit YouTube API audit form. | Technical Lead | **P1** | Removes "Unverified App" warning during customer Google/YouTube OAuth connection. |
| **BLK-03** | **Google Business Profile API** | Programmatic Local Map Posts, Profile Photos & Review Replies | **Code Complete** for discovery & SEO; direct write client ready for GMB binding. | Submit Google Business Profile API Access Request form via Google Cloud Console project. | Operations | **P2** | Unlocks direct programmatic GMB write endpoints for autonomous review responses and weekly map posts. |
| **BLK-04** | **Google Ads API** | Programmatic Google Search Ad Campaign Management | **Code Complete** for keyword strategy briefs, ad copy, and planning DAGs. | Apply for Google Ads API Developer Token (Basic / Standard access) in Google Ads Manager Account (MCC). | Operations | **P2** | Enables direct programmatic upload of approved search ads into customer Google Ads accounts. |
| **BLK-05** | **Meta WhatsApp Cloud API** | Proactive Outbound Notifications & 26th Value Reports | **Code Complete** in `packages/whatsapp/src/outbound.ts` and Copilot. | Submit WhatsApp message templates (`stratxcel_audit_ready`, `stratxcel_weekly_update`, `stratxcel_monthly_recap`) for Meta approval in WhatsApp Business Manager. | Operations | **P1** | Guarantees instant delivery of outbound notifications to customer WhatsApp numbers outside the 24-hour conversational window. |
| **BLK-06** | **Razorpay Payments** | Live Customer Subscription Billing & Mandates | **Code Complete** in `packages/payments-and-wallet/` and `lib/billing/`. | Verify live Razorpay merchant KYC and enable recurring UPI AutoPay / e-Mandate support in Razorpay Dashboard. | Finance / Admin | **P0** | Live customer credit card, debit card, NetBanking, and UPI recurring payments processed seamlessly. |
