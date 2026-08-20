# StratXcel Customer App: Screen Inventory & Forensic UI Audit

**Document Version:** 1.0.0  
**Scope:** Complete Route Catalog across Mobile (375px, 390px, 412px) and Desktop (1280px+)  
**Focus:** Small Indian Businesses (Retailers, Kiranas, Clinics, Salons, Restaurants, Workshops)  
**Author:** Lead UI Auditor & Mobile Product Specialist  

---

## 1. Inventory Summary & Catalog Matrix

This inventory documents all customer-facing routes reachable under `/app/*`. Every screen is analyzed across viewports, user states, visual components, interaction defects, and redesign requirements.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                CUSTOMER ROUTE INVENTORY OVERVIEW                                 │
├──────┬──────────────────────┬─────────────────────────────┬──────────────┬────────────┬──────────┤
│ #    │ Route Path           │ Surface Name                │ Primary Job  │ Viewports  │ Priority │
├──────┼──────────────────────┼─────────────────────────────┼──────────────┼────────────┼──────────┤
│ 01   │ /app                 │ Home (Command Center)       │ Daily pulse  │ 375-1280px │ P0       │
│ 02   │ /app/audit           │ Business Growth Audit       │ Problem diag │ 375-1280px │ P0       │
│ 03   │ /app/audit/[auditId] │ Historical Audit Report     │ Past audits  │ 375-1280px │ P1       │
│ 04   │ /app/social/copilot  │ Copilot (Growth Assistant)  │ Ask / Create │ 375-1280px │ P0       │
│ 05   │ /app/brand           │ Business Profile (Brand)    │ Shop info    │ 375-1280px │ P1       │
│ 06   │ /app/website         │ Website & Domain Manager    │ Web presence │ 375-1280px │ P1       │
│ 07   │ /app/website/create  │ Smart Website Builder       │ Instant site │ 375-1280px │ P1       │
│ 08   │ /app/integrations    │ Connected Channels          │ Connect data │ 375-1280px │ P1       │
│ 09   │ /app/billing         │ Billing, Plans & Wallet     │ Subscriptions│ 375-1280px │ P1       │
│ 10   │ /app/team            │ Team & Permissions          │ Staff access │ 375-1280px │ P2       │
│ 11   │ /app/settings        │ Settings & Security         │ Account pref │ 375-1280px │ P2       │
│ 12   │ /app/crm             │ Inquiries / Leads (Stub)    │ Customer DMs │ 375-1280px │ P1       │
│ 13   │ /app/crm/[leadId]    │ Lead Detail Record (Stub)   │ Customer card│ 375-1280px │ P2       │
│ 14   │ /app/content         │ Content Hub (Staff Gated)   │ Post studio  │ 375-1280px │ P2       │
│ 15   │ /app/content/studio  │ Post Studio (Draft/Create)  │ Craft posts  │ 375-1280px │ P2       │
│ 16   │ /app/content/calendar│ Content Calendar View       │ Schedule     │ 375-1280px │ P2       │
│ 17   │ /app/content/autopilot│ Social Autopilot Settings  │ Auto-post    │ 375-1280px │ P1       │
│ 18   │ /app/content/inbox   │ Cross-Platform Social Inbox │ Unified DMs  │ 375-1280px │ P2       │
│ 19   │ /app/content/analytics│ Content Reach & Engagement │ Post stats   │ 375-1280px │ P2       │
│ 20   │ /app/missions        │ Missions List (Legacy)      │ Task list    │ 375-1280px │ P3       │
│ 21   │ /app/reports         │ Telemetry Reports (Legacy)  │ System logs  │ 375-1280px │ P3       │
│ 22   │ /app/onboarding      │ New Customer Onboarding     │ Fast setup   │ 375-1280px │ P0       │
└──────┴──────────────────────┴─────────────────────────────┴──────────────┴────────────┴──────────┘
```

---

## 2. Deep Forensic Screen-by-Screen Audit

---

### SCREEN 01: Home (`/app`)
- **Route:** `file:///d:/c%20drive%20backup/stratxcel-automation-platform/app/app/page.tsx`
- **Purpose:** Primary landing screen for all authenticated business owners.
- **Target User:** Kirana store owner, clinic manager, salon owner, restaurant proprietor.
- **Primary Job-To-Be-Done:** In 15 seconds, understand online business health, identify urgent issues, and take immediate action.

#### Viewport Behaviors Inspected
- **Mobile (375px / 390px / 412px):**
  - Hero card stack with 3 action buttons wraps awkwardly into 3 full-width rows.
  - "What's verified and ready" displays 4 cards in a 1-column stack, pushing actionable content 1,200px below the fold.
  - "What you can unlock" renders 6 long feature cards that feel like marketing clutter.
- **Desktop (1280px+):**
  - Clean multi-column grid layout, but suffers from low information density for subscribed users.

#### State Analysis
1. **Free / Unsubscribed User State:**
   - *What User Sees:* "Good Morning 👋 [Business Name] is ready to grow", 4 setup verification cards (Profile, WhatsApp Alerts, Public Presence, Business Audit), 6 plan unlock feature cards, bottom conversion banner (₹4,999/mo).
   - *What is Bad/Confusing:* The owner already finished onboarding and wants to know *what is wrong with their Google Maps ranking or website right now*, but is shown marketing copy explaining what a plan unlocks.
2. **Subscribed / Paid User State:**
   - *What User Sees:* 4 metric chips (Health Score 72/100, Connected Sources 3, Active Missions 1, Monthly Usage 35%), "Running now" section, "Next best actions" cards.
   - *What is Bad/Confusing:* "Active Missions" and "Monthly Usage 35%" are meaningless SaaS abstractions to a local retailer.

#### Recommended Redesign Blueprint for Home
- **Above The Fold (Mobile):**
  1. **Greeting & Store Header:** `Patel Daily Needs` · Green Live Badge `● Google Maps & WhatsApp Active`.
  2. **Online Health Score Card:** Single high-impact card displaying score (e.g. `78/100`) + 1-sentence verdict (*"Good search visibility, but missing 12 customer reviews and weekend store hours"*).
  3. **Today's 3 Urgent Actions (Swipeable / Stack):**
     - Card 1: *Post Today's Festival Offer on Instagram* -> CTA: `[Preview & Post]`
     - Card 2: *Reply to 2 New Google Reviews* -> CTA: `[Reply via AI]`
     - Card 3: *Enable WhatsApp Late-Night Auto-Reply* -> CTA: `[Turn On]`
- **Below The Fold (Mobile):**
  4. **Activity & Lead Pulse:** Total customer calls/WhatsApp clicks this week (e.g. `48 Inquiries · +12% vs last week`).
  5. **Quick Tools Strip:** 4 tap icons: `[Create Poster]`, `[Update Timings]`, `[Send WA Broadcast]`, `[View Audit]`.
- **Elements to Remove:** Generic "What you can unlock" marketing cards, "Active Missions" gauge, "Monthly Usage %".

---

### SCREEN 02: Business Growth Audit (`/app/audit`)
- **Route:** `file:///d:/c%20drive%20backup/stratxcel-automation-platform/app/app/audit/page.tsx` & `VisualAuditReport.tsx`
- **Purpose:** Comprehensive diagnostic report on the business's web presence, search discoverability, social footprint, and customer trust.
- **Primary Job-To-Be-Done:** Explain in plain language why the business is missing out on local customers and give a step-by-step fix plan.

#### Viewport Behaviors Inspected
- **Mobile (375px–412px):**
  - Scroll height exceeds 3,500px.
  - Category breakdown bars stack vertically with small text (`11px`) that is hard to read in bright sunlight.
  - Finding cards (Strengths, Gaps, Risks, Quick Wins) render as long single-column blocks with repetitive bullet points.
- **Desktop (1280px+):**
  - Spacious 4-column grid for findings, clear header action buttons (Download PDF, Share, Send to WhatsApp).

#### State Analysis
1. **Processing / Generation State:**
   - Displays a 6-stage vertical progress checklist (`QUEUED`, `RESEARCH`, `ANALYSIS`, `QUALITY_GATE`, `DELIVERY`, `COMPLETE`).
   - *Verdict:* Very good. Gives confidence that real research is occurring.
2. **Report Delivered State:**
   - Displays Digital Health Score, 4 Finding Cards, Category Breakdown, 30-Day Roadmap, and 4 Pricing Tier Cards.
   - *What is Bad:* The category scores ("brandPositioning", "automationOperations") use developer camelCase and corporate strategy jargon.

#### Recommended Redesign Blueprint for Audit
- **Above The Fold:**
  1. **Score & Plain-Language Summary:** Large score circle `74/100` + *"Your shop is easy to find on Google Maps, but competitors have 4x more customer reviews and active Instagram posts."*
  2. **WhatsApp & PDF Actions:** Prominent sticky button: `[📲 Send Report to My WhatsApp]`.
- **Core Diagnosis Section (Tabbed or Accordion on Mobile):**
  - **1. What is Working Well (Green):** 2 verified strengths with green tickmarks.
  - **2. What is Costing You Customers (Red/Amber):** Top 3 gaps with estimated impact (e.g. *"Missing weekend opening hours costs ~15 walk-ins every Saturday"*).
  - **3. What to Fix in Next 30 Days:** 3 simple, non-technical steps.
- **Action CTA:** Single clear card: *"Let StratXcel fix these 3 issues automatically with the Growth Plan (₹4,999/mo)"* -> `[Activate 1-Click Fix]`.
- **Elements to Remove / Hide:** Internal category score progress bars moved behind a secondary `"View Detailed Technical Breakdown"` toggle.

---

### SCREEN 03: Copilot / Growth Assistant (`/app/social/copilot`)
- **Route:** `file:///d:/c%20drive%20backup/stratxcel-automation-platform/app/app/social/copilot/page.tsx` & `TenantCopilotFullPage.tsx`
- **Purpose:** Interactive conversational assistant to create marketing content, draft replies, plan promotions, and execute campaigns.
- **Primary Job-To-Be-Done:** Act as an on-demand, 24/7 digital marketing manager for the shop owner.

#### Viewport Behaviors Inspected
- **Mobile (375px–412px):**
  - **CRITICAL P0 DEFECT:** Renders desktop 3-pane resizable layout. Left rail (`SessionRail`) and right rail (`ExecutionTrace`) squeeze the center chat box into an unusable sliver. Text wraps every 2 words.
- **Desktop (1280px+):**
  - Full IDE style workspace. Works well for desktop power users, but terminology is overly complex.

#### Recommended Redesign Blueprint for Copilot / Assistant
- **Rename:** Change customer-facing name from **"Copilot"** to **"Growth Assistant"** or **"Ask StratXcel"** (Hindi tooltip: *व्यापार सहायक*).
- **Mobile-First Layout (1 Single Fluid Column):**
  1. **Header:** Simple bar with back button, business name, and `[+ New Task]` button.
  2. **Suggested Prompt Chips (Horizontal Scrolling):**
     - `✨ Create Ganesh Chaturthi offer poster`
     - `⭐ Write polite reply to negative Google review`
     - `📢 Create WhatsApp discount broadcast message`
     - `🔍 Check my local competitor rankings`
  3. **Chat Stream:** WhatsApp-style message bubbles with clean typography, high contrast, and instant action buttons inside the response:
     - `[Approve & Post to Instagram]`
     - `[Edit Caption]`
     - `[Send to WhatsApp]`
  4. **Composer Bar:** Generous 48px input field with voice note mic button (`🎙️ Talk in Hindi or English`) and gallery attachment icon.
- **Elements to Remove:** `ExecutionTrace`, `Autonomy Mode`, `Session Group Collapsibles`, `Variant Matrix`.

---

### SCREEN 04: Business Details / Brand Brain (`/app/brand`)
- **Route:** `file:///d:/c%20drive%20backup/stratxcel-automation-platform/app/app/brand/page.tsx`
- **Purpose:** Store and maintain the business's verified core information (name, address, hours, catalog, voice).
- **Primary Job-To-Be-Done:** Ensure StratXcel always uses accurate, up-to-date shop details when generating posts, replies, and websites.

#### Viewport Behaviors Inspected
- **Mobile (375px–412px):**
  - 12 consecutive vertical text fields with no grouping or progressive disclosure.
  - "Brand Brain Version 1" subtitle creates immediate confusion.
- **Desktop (1280px+):**
  - 2-column form layout, but feels like an administrative database entry screen.

#### Recommended Redesign Blueprint for Business Details
- **Rename:** Change from **"Brand Brain"** to **"Shop & Business Profile"** (*दुकान की जानकारी*).
- **Categorized Sections (Collapsible Cards):**
  1. **Basic Info:** Business Name, Category / Industry, Contact Phone, WhatsApp Number, Email.
  2. **Store Location & Hours:** Full Address, Nearby Landmark, Google Maps Pin Link, Opening & Closing Hours, Weekly Holiday (e.g. *Closed on Tuesdays*).
  3. **What You Sell (Products & Services):** Tap-to-add list with Item Name, Starting Price (₹), and Short Description (e.g. *Special Motichoor Ladoo · ₹400/kg*).
  4. **Special Offers & Highlights:** Free Home Delivery, UPI Accepted, AC Seating, 24/7 Emergency Service.
  5. **Photos & Logo:** Simple upload grid for storefront photo, visiting card, owner photo, and product images.
- **Elements to Remove:** "Brand Brain Versioning", "Positioning Statement", "Content Pillars", "Autonomy Rules".

---

### SCREEN 05: Website & Domains (`/app/website`)
- **Route:** `file:///d:/c%20drive%20backup/stratxcel-automation-platform/app/app/website/page.tsx`
- **Purpose:** Manage the business's live website, custom `.in` / `.com` domain, and online menu/catalog.
- **Primary Job-To-Be-Done:** Give the business a fast, verified online store and booking destination without technical maintenance.

#### Viewport Behaviors Inspected
- **Mobile (375px–412px):**
  - "AI Website Factory" header with dense technical subtext.
  - Embedded preview iframe is cut off horizontally and cannot be easily navigated on small screens.
- **Desktop (1280px+):**
  - Website card + Domain manager + Revision instruction box.

#### Recommended Redesign Blueprint for Website
- **State A: No Website Yet**
  - Hero Card: *"You don't have a website yet. Let StratXcel create a beautiful 1-page mobile website for your shop in 30 seconds."*
  - Single Button: `[✨ Create My Free Website]`.
- **State B: Website Live**
  - **Top Card:** Live Website Preview thumbnail + `[🌐 View Live Site: pateldailyneeds.in]` + `[🔗 Copy Link]`.
  - **Domain Manager:** Shows status `● Domain Active (pateldailyneeds.in)` or `[Claim Your .in Domain for ₹499/yr]`.
  - **Simple Edit Controls:** 4 visual buttons instead of prompt box:
    - `[✏️ Edit Phone & Address]`
    - `[📸 Add New Photos]`
    - `[🏷️ Update Menu & Prices]`
    - `[💬 Change WhatsApp Button]`
- **Elements to Remove:** "AI Website Factory" header, raw prompt instruction box.

---

### SCREEN 06: Connected Accounts (`/app/integrations`)
- **Route:** `file:///d:/c%20drive%20backup/stratxcel-automation-platform/app/app/integrations/page.tsx`
- **Purpose:** Connect external business platforms (Google Business, WhatsApp, Instagram, Facebook).
- **Primary Job-To-Be-Done:** Enable StratXcel to pull review data, publish posts, and reply to customer inquiries.

#### Viewport Behaviors Inspected
- **Mobile (375px–412px):**
  - 8 connector cards stacked in a single column. Cards for low-value channels (Threads, LinkedIn) clutter the screen.
  - Confusing status chips ("Testing access required", "Discovered public").
- **Desktop (1280px+):**
  - 2-column card grid with modal dialogs for OTP verification.

#### Recommended Redesign Blueprint for Connected Accounts
- **Priority Tiering:**
  - **Tier 1 (Crucial for Local Revenue):**
    1. **Google Business Profile:** Large card with clear explanation (*"Required for Google Maps ranking and customer reviews"*). Status: `● Connected` or `[Connect Google Account]`.
    2. **WhatsApp Business:** Card with phone verification (*"Required for instant lead alerts and report delivery"*). Status: `● Active (+91 98250 XXXXX)`.
    3. **Instagram & Facebook:** Card (*"Required for daily automated poster publishing"*).
  - **Tier 2 (Optional / Advanced):** Collapsible section titled *"Other Channels (YouTube, LinkedIn, Analytics)"*.
- **Honest Status Badges:** Only 3 simple states:
  - `🟢 Active & Working`
  - `⚪ Not Connected (Tap to Connect)`
  - `🔴 Reconnect Required (Login Expired)`

---

### SCREEN 07: Billing & Plans (`/app/billing`)
- **Route:** `file:///d:/c%20drive%20backup/stratxcel-automation-platform/app/app/billing/page.tsx`
- **Purpose:** Manage active subscription plan, download tax invoices, and enter GSTIN details for input credit.
- **Primary Job-To-Be-Done:** Transparent, hassle-free subscription management with clear INR pricing and tax compliance.

#### Viewport Behaviors Inspected
- **Mobile (375px–412px):**
  - Wallet balance card + Plan comparison cards + GST form + Invoice table creates a dense, intimidating screen.
- **Desktop (1280px+):**
  - Structured card sections with complete pricing breakdown.

#### Recommended Redesign Blueprint for Billing
- **Current Plan Card:** Shows active plan (e.g. `Growth Plan · ₹9,999/mo + GST`), renewal date, and payment method (Razorpay / UPI AutoPay).
- **Simplified 3-Tier Plan Comparison:**
  1. **Starter (₹4,999/mo):** *"For basic online presence, verified 1-page website, and automated WhatsApp receptionist."*
  2. **Growth (₹9,999/mo) [Most Popular]:** *"For active local businesses wanting daily Instagram posters, Google Maps ranking optimization, and review management."*
  3. **Business (₹19,999/mo):** *"For high-growth stores needing paid ad management, multi-channel marketing, and dedicated support."*
- **GST & Business Tax Info Card:** Simple input fields for Legal Name, GSTIN, and State with instant validation.
- **Invoices:** Clean list with Date, Amount (₹), and 1-tap `[Download Tax Invoice PDF]` button.

---

### SCREEN 08: Team & Staff Access (`/app/team`)
- **Route:** `file:///d:/c%20drive%20backup/stratxcel-automation-platform/app/app/team/page.tsx`
- **Purpose:** Invite store managers, family members, or receptionists to access the store workspace.
- **Primary Job-To-Be-Done:** Give staff access to view leads and approve posts without exposing billing or owner settings.

#### Recommended Redesign Blueprint for Team
- **Simplified Roles:**
  - **Owner:** Full access to all features, billing, and settings.
  - **Manager / Receptionist:** Can chat with assistant, approve social posts, and reply to customer inquiries. No billing access.
  - **Staff:** View-only access to customer leads and schedules.
- **1-Tap WhatsApp Invite:** Instead of requiring email addresses, allow generating a secure **WhatsApp Invite Link** that the owner can forward directly to their staff.

---

### SCREEN 09: Settings (`/app/settings`)
- **Route:** `file:///d:/c%20drive%20backup/stratxcel-automation-platform/app/app/settings/page.tsx`
- **Purpose:** Workspace preferences, notifications, security, and language.
- **Primary Job-To-Be-Done:** Centralize all non-daily configuration in one clean, predictable hub.

#### Recommended Redesign Blueprint for Settings
- **1. Profile & Account:** Owner Name, Phone Number, Login Email, Change Password.
- **2. WhatsApp Notifications:** Toggles for *Daily Morning Growth Brief*, *Instant Lead Alerts*, *Review Alerts*.
- **3. App Language:** Options: `English`, `Hinglish (हिंदी / English)`.
- **4. Appearance:** Light Mode / Dark Mode toggle (Default: Light).
- **5. Support & Help:** Direct WhatsApp chat with StratXcel Support (`[💬 Chat with Support on WhatsApp]`).
