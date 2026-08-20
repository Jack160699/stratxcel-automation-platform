# StratXcel Customer App: Master Information Architecture & Navigation Blueprint

**Document Version:** 1.0.0  
**Design Paradigm:** Mobile-First, Owner-Centric, Low-Cognitive-Load for Indian Small Businesses  
**Author:** Lead Information Architect & Product Strategist  

---

## 1. Information Architecture Philosophy & Core Mental Model

The proposed Information Architecture (IA) restructures StratXcel around the natural operating rhythm of an Indian small business owner.

### The 4-Pillar Customer Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 STRATXCEL CUSTOMER INFORMATION ARCHITECTURE                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   1. HOME (आज का काम)                                                      │
│      ↳ Daily health pulse, customer inquiries, 3 urgent daily actions       │
│                                                                             │
│   2. AUDIT (ऑनलाइन जांच)                                                   │
│      ↳ Business health diagnosis, Google/Social gaps, 30-day fix roadmap    │
│                                                                             │
│   3. ASSISTANT (व्यापार सहायक)                                              │
│      ↳ 1-tap marketing generation, poster maker, review replies, WhatsApp   │
│                                                                             │
│   4. MORE (अन्य सुविधाएं)                                                  │
│      ↳ Shop Profile, Website, Connected Accounts, Billing, Staff, Settings │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Navigation Architecture

### 2.1 Primary Mobile Navigation (Bottom Dock — Fixed `<768px`)
The bottom navigation bar contains **4 primary persistent slots** plus the **More menu trigger**. All touch targets are minimum 48px height with 12px label typography and high contrast icons.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             MOBILE BOTTOM DOCK                              │
├──────────────┬──────────────┬──────────────┬──────────────┬─────────────────┤
│     [🏠]     │     [📊]     │     [✨]     │     [🏪]     │       [⋯]       │
│     Home     │    Audit     │  Assistant   │ Shop Profile │      More       │
│    (/app)    │ (/app/audit) │(/app/copilot)│ (/app/brand) │  (Bottom Sheet) │
└──────────────┴──────────────┴──────────────┴──────────────┴─────────────────┘
```

1. **Home (`/app`):** Daily snapshot, today's tasks, inquiries, and immediate actions.
2. **Audit (`/app/audit`):** Online visibility diagnosis, Google ranking status, review score, and action roadmap.
3. **Assistant (`/app/copilot`):** Conversational growth tool with 1-tap chips (posters, review replies, festival campaigns).
4. **Shop Profile (`/app/brand`):** Business details, address, opening hours, services/catalog, and photos.
5. **More (Slide-Up Sheet):** Secondary destinations, settings, billing, website, and support.

---

### 2.2 The "More" Bottom Sheet Architecture

When the user taps **"More"**, a clean native-style bottom sheet slides up with grouped, human-friendly destinations:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             "MORE" MENU SHEET                               │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🌐 ONLINE PRESENCE                                                          │
│   • Website & Domain          (Manage live site, menu, and custom domain)  │
│   • Connected Accounts        (Google Maps, WhatsApp, Instagram, Facebook) │
│                                                                             │
│ 💼 ACCOUNT & BILLING                                                        │
│   • Plan & Invoices           (Current plan, GST invoices, payment method) │
│   • Staff & Permissions       (Invite family or shop managers)             │
│                                                                             │
│ ⚙️ PREFERENCES & HELP                                                       │
│   • Settings & Language       (Notifications, password, Hinglish toggle)   │
│   • WhatsApp Help & Support   (Chat directly with StratXcel team)          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 2.3 Desktop Navigation (Collapsible Sidebar — `>=768px`)

Desktop acts as the expansive view of the mobile foundation. It uses a structured left sidebar with grouped sections:

```
┌───────────────────────────┬─────────────────────────────────────────────────┐
│ STRATXCEL SIDEBAR         │ MAIN WORKSPACE CONTENT AREA                     │
├───────────────────────────┤                                                 │
│ [Logo] StratXcel          │                                                 │
│ [Store] Patel Daily Needs │                                                 │
│ ───────────────────────── │                                                 │
│ MAIN                      │                                                 │
│   🏠 Home                 │                                                 │
│   📊 Business Audit       │                                                 │
│   ✨ Growth Assistant     │                                                 │
│                           │                                                 │
│ ASSETS & CHANNELS         │                                                 │
│   🏪 Shop Profile         │                                                 │
│   🌐 Website & Domain     │                                                 │
│   🔗 Connected Accounts   │                                                 │
│                           │                                                 │
│ MANAGEMENT                │                                                 │
│   💳 Plan & Billing       │                                                 │
│   👥 Staff Access         │                                                 │
│   ⚙️ Settings             │                                                 │
│   💬 WhatsApp Support     │                                                 │
└───────────────────────────┴─────────────────────────────────────────────────┘
```

---

## 3. Screen-by-Screen Information Hierarchy

---

### 3.1 HOME (`/app`) — Exact Section Order & Hierarchy

1. **Header Bar:** Store Name (`Patel Daily Needs`) + Status Indicator (`● Live on Google & WhatsApp`) + WhatsApp Brief Trigger (`[📲 Today's Brief]`).
2. **Online Health Summary Card (Above Fold):**
   - Health Score badge: `76/100` (Color-coded green/amber).
   - Plain-language summary: *"Your Google ranking is strong, but you have 2 unanswered negative reviews and no weekend posts scheduled."*
3. **Today's 3 Urgent Actions (High-Priority Cards):**
   - *Action 1:* `Post Today's Festival Offer` -> `[1-Click Publish]`
   - *Action 2:* `Reply to New Google Review` -> `[Draft Polite Reply]`
   - *Action 3:* `Turn on WhatsApp Night Receptionist` -> `[Activate]`
4. **Customer Activity Pulse (Below Fold):**
   - Total Leads/Inquiries this week (`52 Total · 34 WhatsApp · 18 Phone Calls`).
   - Latest Customer Inquiries list (Last 3 customer messages with 1-tap `[Reply on WhatsApp]` CTA).
5. **Quick Tools Bar:**
   - `[🎨 Create Poster]` · `[⏰ Update Hours]` · `[📢 Send Offer]` · `[🌐 View Website]`.

---

### 3.2 AUDIT (`/app/audit`) — Exact Section Order & Hierarchy

1. **Header:** Title *"Your Business Online Health Check"* + Business Name + Sticky CTA `[📲 Send Report to WhatsApp]`.
2. **Overall Health & Verdict (Above Fold):**
   - Score: `74 / 100`.
   - Clear Verdict: *"Foundational presence is active. Your biggest growth blocker is low Google review volume and lack of consistent social posting."*
3. **Core Diagnostic Findings (3 Visual Blocks):**
   - **Block A (Strengths - Green):** *"What is already working for your shop"* (2 items).
   - **Block B (Critical Gaps - Amber/Red):** *"Where you are losing customers right now"* (3 items with estimated walk-in loss).
   - **Block C (Quick Fixes - Blue):** *"What StratXcel can fix in the next 7 days"* (3 items).
4. **30-Day Growth Roadmap:**
   - 4 sequential milestone cards (Week 1 to Week 4).
5. **Action / Upgrade Banner:**
   - Single clean card: *"Fix all 3 critical gaps automatically with the Growth Plan (₹4,999/mo)"* -> `[Activate 1-Click Fix]`.
6. **Detailed Technical Breakdown (Collapsible Accordion):**
   - Hidden by default. Expanding shows category score gauges (Search Visibility, Website Speed, Review Trust, Social Footprint).

---

### 3.3 ASSISTANT (`/app/copilot`) — Exact Section Order & Hierarchy

1. **Top Bar:** Back button + *"Growth Assistant"* + `[+ New Task]`.
2. **1-Tap Quick Action Chips (Horizontal Scroll):**
   - `[🎨 Festival Poster]` · `[⭐ Review Reply]` · `[📢 WhatsApp Offer]` · `[🔍 Competitor Check]`.
3. **Conversational Stream:**
   - User requests and Assistant answers displayed as clean WhatsApp-style cards.
   - Outputs include visual preview cards (e.g. generated poster image + caption) with actionable buttons:
     - `[🚀 Post to Instagram & Facebook]`
     - `[📲 Share on WhatsApp]`
     - `[✏️ Edit Text]`
4. **Bottom Composer Bar (Fixed):**
   - Text input (`"Ask StratXcel anything about growing your business..."`) + Voice Mic button (`🎙️`) + Media attachment icon.

---

### 3.4 SHOP PROFILE (`/app/brand`) — Exact Section Order & Hierarchy

1. **Header:** Title *"Shop & Business Details"* + Save Status (`✓ All changes saved`).
2. **Category 1: Basic Information:** Store Name, Business Category, Phone Number, WhatsApp Number.
3. **Category 2: Location & Hours:** Street Address, Landmark, Google Maps Pin Link, Working Hours, Weekly Off.
4. **Category 3: Products & Services Catalog:** Tap-to-add list with Name, Price (₹), and Description.
5. **Category 4: Business Highlights:** Free Delivery, UPI Accepted, Parking Available, AC Seating.
6. **Category 5: Photos & Logo:** Storefront photo, Visiting card, Product pictures.

---

### 3.5 CONNECTED ACCOUNTS (`/app/integrations`) — Exact Section Order & Hierarchy

1. **Header:** Title *"Connected Platforms"* + Subtitle *"Connect your accounts so StratXcel can manage your online growth."*
2. **Essential Channels (Top Grid):**
   - **Google Business Profile:** `[🟢 Connected · Patel Daily Needs]` -> `[Manage Reviews]`
   - **WhatsApp Business:** `[🟢 Active · +91 98250 XXXXX]` -> `[Change Number]`
   - **Instagram & Facebook:** `[⚪ Connect Meta Account]` -> `[Connect]`
3. **Secondary Channels (Collapsible):**
   - YouTube, LinkedIn, Google Search Console, Google Analytics.

---

### 3.6 WEBSITE & DOMAINS (`/app/website`) — Exact Section Order & Hierarchy

1. **Website Status Card:**
   - Preview thumbnail + Live URL (`https://pateldailyneeds.in`) + Status badge `● Live & Indexed`.
2. **Domain Card:**
   - Custom Domain status (`pateldailyneeds.in`) + DNS Verification check + `[Buy New .in Domain]`.
3. **Fast Visual Editor Actions:**
   - `[✏️ Edit Contact & Address]` · `[📸 Change Photos]` · `[🏷️ Update Menu / Prices]`.

---

### 3.7 PLAN & BILLING (`/app/billing`) — Exact Section Order & Hierarchy

1. **Current Plan Card:** Active Plan name, Monthly Price (₹), Next Renewal Date, Payment Method.
2. **Plan Comparison Grid (3 Tiers):** Starter (₹4,999), Growth (₹9,999), Business (₹19,999).
3. **Business GST & Tax Invoice Profile:** Legal Entity Name, GSTIN, Registered State.
4. **Past Invoices Table:** Invoice #, Date, Amount (₹), `[Download PDF]`.

---

### 3.8 SETTINGS (`/app/settings`) — Exact Section Order & Hierarchy

1. **Account Details:** Owner Name, Email, Phone Number, Password.
2. **Notification Preferences:** WhatsApp Alert Toggles (Daily Brief, New Lead, Review Alert).
3. **Language Selection:** `English` / `Hinglish (हिंदी / English)`.
4. **Help & Support:** `[💬 Open WhatsApp Support Chat]`.
5. **Session Management:** `[Log Out of This Device]`.

---

## 4. User Journey & Interaction Flow Diagrams

### Flow 1: 30-Second Morning Check-In (Daily Owner Routine)
```
[Owner opens StratXcel App]
       │
       ▼
[Home Screen loads in <1.5s]
  - Sees Health Score: 78/100
  - Sees Alert: "Today is Ganesh Chaturthi"
       │
       ▼
[Taps "Preview Festival Offer"]
       │
       ▼
[Assistant shows generated poster + Hindi/English caption]
       │
       ▼
[Owner taps "Post to Instagram & WhatsApp"]
       │
       ▼
[Success Toast: "Posted successfully! 0 mins wasted."]
```

### Flow 2: Immediate WhatsApp Audit Delivery
```
[User completes free audit scan]
       │
       ▼
[Audit Page renders 74/100 score + 3 top issues]
       │
       ▼
[User taps "Send to WhatsApp"]
       │
       ▼
[StratXcel sends formatted PDF + 3-point summary directly to user's WhatsApp]
```
