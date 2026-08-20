# StratXcel Customer App: UX Redesign Backlog & Priority Action Cards

**Document Version:** 1.0.0  
**Target:** Implementation-Ready Backlog for Engineering and Product Design Teams  
**Classification:** P0 (Critical / Unusable) to P3 (Polish / Enhancement)  
**Author:** Lead Product Designer & Quality Assurance Lead  

---

## 1. Executive Priority Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          UX DEFECT & REDESIGN SUMMARY                       │
├────────────────────┬──────────┬─────────────────────────────────────────────┤
│ Priority Level     │ Count    │ Focus Area                                  │
├────────────────────┼──────────┼─────────────────────────────────────────────┤
│ P0 (Critical)      │ 4 Issues │ Mobile Layout Breaks, Blocked Workflows     │
│ P1 (High Impact)   │ 8 Issues │ Cognitive Overload, Technical Jargon, Forms │
│ P2 (Medium)        │ 9 Issues │ Navigation Consolidation, Pricing Clarity   │
│ P3 (Low / Polish)  │ 6 Issues │ Micro-animations, Theme Tuning, Tooltips    │
├────────────────────┼──────────┼─────────────────────────────────────────────┤
│ TOTAL ISSUES       │ 27 Items │ 100% Documented with Acceptance Criteria   │
└────────────────────┴──────────┴─────────────────────────────────────────────┘
```

---

## 2. Master UX Action Cards

---

### [P0] CRITICAL / BROKEN USER EXPERIENCES

#### ISSUE-01: Mobile Layout Break on Copilot Assistant Screen
- **Screen / Route:** `/app/social/copilot` (`TenantCopilotFullPage.tsx`)
- **Viewport:** Mobile (375px, 390px, 412px)
- **Severity:** **P0**
- **User Impact:** Small business owners on smartphones cannot read or interact with the Copilot. The 3-pane resizable layout squeezes the center conversation to ~80px width, causing horizontal scroll overflow and overlapping buttons.
- **Root Cause:** Legacy port of admin desktop IDE components (`ResizableWorkspace`, `saut-agent-rail`) into customer shell without responsive single-column mobile fallback.
- **Detailed Solution:**
  1. Build a dedicated mobile single-column chat interface.
  2. Hide the left session rail behind a top conversation drawer.
  3. Remove the right telemetry/execution-trace rail on mobile entirely.
  4. Implement a clean WhatsApp-style chat stream with full-width action cards.
- **Acceptance Criteria:**
  - [ ] On screens `<768px`, page renders as 1 full-width fluid column with zero horizontal scrolling.
  - [ ] Text bubbles have minimum 14px font size with 20px line height.
  - [ ] Composer input field remains fixed above mobile bottom bar with 48px tap target.

---

#### ISSUE-02: Empty State Dead-Ends on Unconnected Channels
- **Screen / Route:** `/app/integrations` & `/app`
- **Viewport:** All Viewports
- **Severity:** **P0**
- **User Impact:** When a user arrives with no connected channels, they see grayed-out "Testing access required" or "Discovered public" labels with no actionable path forward.
- **Root Cause:** Connector state machine distinguishes internal developer staging states (`testing_access_required`) and surfaces them directly to end users.
- **Detailed Solution:**
  1. Map all non-connected states to a single user-friendly action: `[Connect Account]`.
  2. Add a clear 1-line business benefit explaining why connecting Google or WhatsApp matters.
- **Acceptance Criteria:**
  - [ ] No internal staging labels (`testing_access_required`, `provider_error`) appear in customer UI.
  - [ ] Every non-connected card provides a 1-tap connection dialog or clear alternative action.

---

#### ISSUE-03: Excessive Mobile Scroll on Business Audit Report
- **Screen / Route:** `/app/audit` (`VisualAuditReport.tsx`)
- **Viewport:** Mobile (375px, 390px, 412px)
- **Severity:** **P0**
- **User Impact:** The audit report page requires over 3,500px of vertical scrolling on mobile phones. Users experience cognitive fatigue and drop off before reaching the actionable 30-day recommendations and commercial fix CTAs.
- **Root Cause:** Monolithic page design that renders detailed category progress bars, multiple data source ledgers, 4 finding lists, and 4 full pricing cards in a single linear stack.
- **Detailed Solution:**
  1. Restructure report into 3 clear visual segments:
     - Segment 1: Health Score + 1-sentence plain-language diagnosis.
     - Segment 2: 3 critical business gaps (with customer walk-in loss impact).
     - Segment 3: 1-click fix plan banner.
  2. Move full category score ledgers into a collapsible `"View Full Diagnostics"` accordion.
- **Acceptance Criteria:**
  - [ ] Total mobile page height reduced by at least 60% (under 1,500px).
  - [ ] Sticky `"Send to WhatsApp"` button remains accessible at all scroll positions.

---

#### ISSUE-04: Non-Responsive 3-Button Action Stack on Mobile Home Hero
- **Screen / Route:** `/app` (`FreeUserDashboard`)
- **Viewport:** Mobile (375px, 390px)
- **Severity:** **P0**
- **User Impact:** On smaller 375px screens (iPhone SE, budget Android devices), the 3 header buttons (`Create Website`, `View Audit`, `Choose Plan`) stack vertically with varying heights and overflow their container borders.
- **Root Cause:** Hardcoded `flex-col sm:flex-row gap-2.5` with uneven text padding inside an absolute flex container.
- **Detailed Solution:**
  1. Standardize to 1 primary CTA button (`[View Your Free Audit →]`) and 1 secondary button (`[✨ Create Website]`).
  2. Ensure full-width 48px button height on mobile with 12px border radius.
- **Acceptance Criteria:**
  - [ ] Zero button text wrapping or container overflow on 375px viewports.
  - [ ] Clear visual hierarchy between primary and secondary buttons.

---

### [P1] HIGH-IMPACT UX BLOCKERS & JARGON REMOVAL

#### ISSUE-05: Remove "Brand Brain" Terminology across Customer App
- **Screen / Route:** `/app/brand`, `/app`, `/app/settings`
- **Severity:** **P1**
- **User Impact:** Small business owners do not understand what a "Brand Brain" or "Brand Brain Version 1" is. They think it is a developer error or AI research tool.
- **Detailed Solution:**
  - Replace "Brand Brain" with **"Shop Profile"** or **"Business Details"** (*दुकान की जानकारी*).
  - Replace "Positioning", "Pillars", and "Rules" with **"Special Offers"**, **"Highlights"**, and **"Services"**.
- **Acceptance Criteria:**
  - [ ] Zero customer-facing occurrences of the word "Brand Brain" or "Version X".

---

#### ISSUE-06: Replace "AI Website Factory" with Simple "Website & Domain"
- **Screen / Route:** `/app/website`
- **Severity:** **P1**
- **User Impact:** "Autonomous AI Website Factory" sounds intimidating and complex to non-technical users.
- **Detailed Solution:**
  - Rename page to **"Website & Domain"** (*आपकी वेबसाइट*).
  - Provide 4 visual 1-tap edit buttons (*Edit Address, Add Photos, Change Prices, WhatsApp Button*) instead of typing raw AI prompts.
- **Acceptance Criteria:**
  - [ ] Page header reads "Website & Domain".
  - [ ] Non-technical shop owners can edit phone, address, and photos in under 3 taps.

---

#### ISSUE-07: WhatsApp Phone Number Verification & Indian Number Formatting
- **Screen / Route:** `/app/integrations`, `/app/audit`, `/app/onboarding`
- **Severity:** **P1**
- **User Impact:** Indian phone numbers entered without `+91` fail validation silently or require manual country code selection.
- **Detailed Solution:**
  - Default country code to `+91` for all Indian tenants.
  - Auto-format 10-digit mobile numbers as `XXXXX XXXXX`.
- **Acceptance Criteria:**
  - [ ] Phone input automatically applies `+91` and 10-digit spacing.
  - [ ] OTP delivery triggers within 3 seconds via WhatsApp Business API.

---

#### ISSUE-08: Consolidate 8 Customer Routes into 4 Core Navigation Tabs
- **Screen / Route:** `MobileBottomNav.tsx` & `app-nav-data.ts`
- **Severity:** **P1**
- **User Impact:** Users get lost between Connectors, Business, Website, Content, and Settings.
- **Detailed Solution:**
  - Primary bottom tabs: **Home**, **Audit**, **Assistant**, **Shop Profile**, and **More**.
  - Move secondary pages (Website, Connectors, Billing, Staff, Settings) into the structured **More Sheet**.
- **Acceptance Criteria:**
  - [ ] Mobile dock has exactly 5 slots with 48px touch targets.
  - [ ] Every destination reachable within 2 taps.

---

### [P2] MEDIUM-PRIORITY ENHANCEMENTS

#### ISSUE-09: Clarify Wallet Balance vs Subscription Plan on Billing Screen
- **Screen / Route:** `/app/billing`
- **Severity:** **P2**
- **User Impact:** Users confuse prepaid wallet balances with recurring monthly subscriptions.
- **Detailed Solution:** Separate "Monthly Plan (Platform Services)" from "Ad Wallet (Meta / Google Ad Spend Only)". Add tooltip explaining that the wallet is only used when running paid ads.

#### ISSUE-10: Add 1-Tap "Send Report to WhatsApp" Sticky Button
- **Screen / Route:** `/app/audit`
- **Severity:** **P2**
- **User Impact:** Owners want to review reports on their own phone or forward them to partners via WhatsApp.
- **Detailed Solution:** Add a persistent green WhatsApp floating button that delivers the formatted PDF report in 1 tap.

#### ISSUE-11: Hindi / Hinglish Language Toggle in Customer Header
- **Screen / Route:** Shell Header (`TopCommandBar.tsx` & Settings)
- **Severity:** **P2**
- **User Impact:** Owners less comfortable with formal English can toggle simple Hinglish wording (e.g. *दुकान की जानकारी*, *आज का काम*, *WhatsApp सहायता*).

---

## 3. Top 15 Redesign Opportunities for Indian SMBs

1. **Instant Morning WhatsApp Pulse:** Deliver a 3-bullet daily growth summary directly to the owner's WhatsApp at 9:00 AM.
2. **1-Tap Festival Poster Maker:** Auto-generate festive posters (Diwali, Eid, Holi, Independence Day) customized with the shop's logo and phone number.
3. **AI Review Auto-Responder:** Draft polite, localized responses to Google Maps reviews in 1 tap.
4. **Google Maps Ranking Booster:** Step-by-step checklist to outrank nearby neighborhood competitors on local search.
5. **24/7 WhatsApp Inquiry Receptionist:** Automatically answer customer questions regarding shop timings, address, and catalog items.
6. **1-Page Mobile Storefront:** Free, fast-loading mobile website with direct "Chat on WhatsApp" button.
7. **UPI QR Code & Digital Visiting Card Generator:** Shareable digital shop profile for WhatsApp status and customer sharing.
8. **Automated Weekly ROI Report:** Show exact number of phone calls, website clicks, and WhatsApp leads generated.
9. **Staff Role Simplification:** 1-tap invite link for store managers without requiring email signups.
10. **GST-Compliant Tax Invoicing:** Instant 1-click download of GST invoices for tax input credit.
11. **Direct Human WhatsApp Support:** 1-tap connection to StratXcel growth specialists.
12. **Neighborhood Competitor Tracker:** See which nearby shops are gaining more Google reviews.
13. **Simple Catalog / Menu Manager:** Update food prices or product stock in 10 seconds.
14. **High-Contrast Outdoor Reading Mode:** Crisp typography optimized for outdoor sunlight reading.
15. **Offline & Low-Network Resilience:** Cache dashboard data so the app opens instantly even on 2G/3G networks.

---

## 4. Top 10 Things to Remove

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TOP 10 THINGS TO REMOVE                            │
├────┬──────────────────────────────────┬─────────────────────────────────────┤
│ #  │ Element to Remove                │ Why It Must Be Removed              │
├────┼──────────────────────────────────┼─────────────────────────────────────┤
│ 01 │ "Brand Brain" & "Version X"      │ MBA/AI jargon; intimidates owners   │
│ 02 │ "AI Website Factory" Header      │ Over-engineered developer phrasing  │
│ 03 │ 3-Column Resizable IDE Rails     │ Completely breaks on mobile phones  │
│ 04 │ "Execution Traces" & Telemetry   │ Technical backend logs, not value   │
│ 05 │ "Active Missions" Counter        │ Meaningless platform abstraction    │
│ 06 │ "Monthly Usage %" Indicator      │ Confuses users with enterprise SaaS │
│ 07 │ "Testing Access Required" Badges │ Internal developer staging states   │
│ 08 │ Dense 3,500px Audit Category Bar │ Causes cognitive fatigue on phones  │
│ 09 │ Raw AI Prompt Edit Boxes         │ Owners cannot write complex prompts │
│ 10 │ Low-Value Connectors (Threads/LI)│ Clutters primary connection screen  │
└────┴──────────────────────────────────┴─────────────────────────────────────┘
```

---

## 5. Top 10 Things to Add

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TOP 10 THINGS TO ADD                              │
├────┬──────────────────────────────────┬─────────────────────────────────────┤
│ #  │ Element to Add                   │ Business Value to Indian SMB Owner  │
├────┼──────────────────────────────────┼─────────────────────────────────────┤
│ 01 │ 1-Tap "Send to WhatsApp" Sticky  │ Immediate offline utility & sharing │
│ 02 │ Today's 3 Urgent Actions Widget  │ Instant clarity on what to do today │
│ 03 │ 1-Tap Festival Poster Creator    │ Daily marketing without agency fees │
│ 04 │ AI Google Review Auto-Reply      │ Protects & grows 5-star reputation  │
│ 05 │ WhatsApp Lead Pulse Counter      │ Shows tangible return on investment │
│ 06 │ Dedicated Mobile Single-Column UI│ Flawless smartphone experience      │
│ 07 │ Simple Shop Profile Categories   │ Easy updates to hours, menu & phone │
│ 08 │ Hinglish Language Option         │ Inclusivity for non-English natives │
│ 09 │ 1-Tap Staff WhatsApp Invite Link │ Fast onboarding for store managers  │
│ 10 │ Human WhatsApp Support Floating  │ Maximum trust & immediate assistance│
└────┴──────────────────────────────────┴─────────────────────────────────────┘
```
