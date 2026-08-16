# StratXcel V1.5 Provider Permissions & Verification Master Guide

**Document Purpose**: Definitive authority on third-party provider permissions, OAuth scopes, App Reviews, manual platform setup, and operational verification required to unlock full StratXcel autonomous growth capabilities.  
**Date**: 2026-08-16  
**Auditor**: StratXcel Autonomous Growth OS Product & Engineering Auditor  

---

## 1. Classification Overview

- **`READY`**: Fully implemented in code, tested, and operational.
- **`NEEDS MANUAL OWNER ACTION`**: Customer/Business owner must click to authorize or enter business details.
- **`NEEDS STRATXCEL PLATFORM ACTION`**: StratXcel platform engineering/operations must configure credentials or deploy bridge.
- **`NEEDS PROVIDER APPROVAL`**: External third-party partner review required (Meta App Review, Google OAuth verification).
- **`BLOCKED`**: Hard external dependency currently preventing execution.

---

## 2. Master Permission Matrix

| Status | Provider | Capability | Required Scopes / Permissions | Where to Obtain | Who Completes | Exact Next Action | What Feature Unlocks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **READY** | **Google** | Search Console Read-Only Analytics | `https://www.googleapis.com/auth/webmasters.readonly` | Google Cloud Console OAuth 2.0 Client | Customer Owner | Click [Connect Google] in `/app/integrations` and grant read access. | Pulls organic search queries, clicks, impressions, CTR, and keyword rankings. |
| **READY** | **Google** | Google Analytics 4 (GA4) Traffic Insights | `https://www.googleapis.com/auth/analytics.readonly` | Google Cloud Console OAuth 2.0 Client | Customer Owner | Click [Connect Google] in `/app/integrations` and select GA4 property. | Pulls active users, sessions, top landing pages, and conversion events. |
| **READY** | **Google** | YouTube Draft Video Uploads | `https://www.googleapis.com/auth/youtube.upload` | Google Cloud Console OAuth 2.0 Client | Customer Owner | Select YouTube Channel in Google One-Tap Hub. | Allows Content Studio to upload draft/unlisted videos directly. |
| **NEEDS PROVIDER APPROVAL** | **Google** | Google OAuth Consent Screen Verification | Sensitive Scopes (`webmasters.readonly`, `analytics.readonly`, `youtube.upload`) | Google Cloud Console $\to$ OAuth consent screen $\to$ Verification | StratXcel Platform Lead | Submit domain verification, privacy policy link, and demo video for Google Trust review. | Removes "Unverified App" warning during customer OAuth flow. |
| **NEEDS PROVIDER APPROVAL** | **Google** | Google Business Profile (GBP) Direct Write API | Google My Business API access | Google Business Profile API Request Form | StratXcel Platform Lead | Submit developer application for Google My Business API write endpoints. | Unlocks direct programmatic posting of weekly updates and review replies on Google Maps. |
| **READY** | **Google** | GBP Guided Creation & Verification Experience | In-App Guided Flow + Public Maps Schema | StratXcel App `/app/integrations/google/verify` | Customer Owner | Follow step-by-step verification instructions (Phone OTP/Video) in Verification Center. | Transitions missing GBP from `USER_ACTION_REQUIRED` to `VERIFIED`. |
| **READY** | **Meta** | Facebook Business Page Management | `pages_show_list`, `pages_read_engagement`, `pages_manage_posts` | Meta Developer Console $\to$ App $\to$ Facebook Login | Customer Owner | Click [Connect Meta] in `/app/integrations` and select Facebook Page. | Autonomous scheduling and publishing of image/link posts to Facebook Page. |
| **READY** | **Meta** | Instagram Professional Publishing & Insights | `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_insights` | Meta Developer Console $\to$ App $\to$ Instagram Login | Customer Owner | Click [Connect Meta] in `/app/integrations` and select Instagram Profile. | Autonomous multi-image carousel, single post, and reels publishing + engagement insights. |
| **READY** | **Meta** | Threads Publishing & Analytics | `threads_basic`, `threads_content_publish`, `threads_manage_insights` | Meta Developer Console $\to$ App $\to$ Threads API | Customer Owner | Click [Connect Meta] in `/app/integrations` and select Threads Account. | Autonomous micro-blogging, news updates, and text posts to Threads. |
| **NEEDS PROVIDER APPROVAL** | **Meta** | Meta App Review for Public Live Publishing | `pages_manage_posts`, `instagram_business_content_publish` | Meta Developer Console $\to$ App Review $\to$ Permissions and Features | StratXcel Operations / Legal | Submit screencast of Social Autopilot UI and business verification documents. | Enables unrestricted live publishing for all customer Instagram/Facebook accounts. |
| **READY** | **LinkedIn** | LinkedIn Company Page Updates | `openid`, `profile`, `w_organization_social`, `r_organization_social` | LinkedIn Developer Portal $\to$ App $\to$ Products | Customer Owner | Click [Connect LinkedIn] in `/app/integrations` and select Organization. | Autonomous B2B thought-leadership articles and company updates. |
| **READY** | **WhatsApp** | WhatsApp Customer Copilot & Value Reports | WhatsApp Cloud API v20.0 | Meta Business Manager $\to$ WhatsApp Accounts | StratXcel Platform Lead | Ensure `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_TOKEN` are set in production env. | Real-time conversational Copilot (Ask, Command, Approve, Alert, Report). |
| **NEEDS PLATFORM ACTION** | **Razorpay** | Live Webhook & Recurring Mandates | `payment.captured`, `subscription.charged` | Razorpay Dashboard $\to$ Settings $\to$ Webhooks | StratXcel Finance / Admin | Configure Webhook URL `https://www.stratxcel.in/api/webhook/razorpay` with secret. | Automatic subscription activation and payment state synchronization. |
| **READY** | **Canonical Website** | URL-Based Business Ingestion & Intelligence | Public HTTP/HTTPS Crawl + JSON-LD Schema | StratXcel Ingestion Engine | Customer Owner | Enter canonical website URL during onboarding or audit. | Zero-credential business fact discovery, SEO analysis, and Brand Brain grounding. |

---

## 3. Human Financial Spend Safety Barrier

For **Meta Ads** and **Google Ads**:
- Autonomous systems operate in **Read, Analyze, Recommend, and Draft** mode.
- Campaign structures, keyword groups, and visual creative briefs are generated automatically.
- **Zero actual ad spend or budget increase occurs without explicit human approval token** verified by the StratXcel Approvals boundary.
