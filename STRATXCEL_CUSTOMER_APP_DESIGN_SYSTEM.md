# StratXcel Customer App: Unified Design System & Component Guidelines

**Document Version:** 1.0.0  
**Design Philosophy:** Calm, High-Trust, High-Contrast, Mobile-First for Indian Small Businesses  
**Author:** Lead UI/UX Systems Architect  

---

## 1. Core Visual Principles & Design Tokens

The StratXcel customer design system is engineered to look **crisp, modern, trustworthy, and effortless** on mobile screens (375px–412px) in bright outdoor sunlight or indoor shop lighting.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CORE DESIGN SYSTEM PRINCIPLES                        │
├──────────────────────┬──────────────────────────────────────────────────────┤
│ 1. 48px Touch Rule   │ Every interactive element has minimum 48x48px target │
├──────────────────────┼──────────────────────────────────────────────────────┤
│ 2. High Contrast     │ Minimum 4.5:1 WCAG AA text contrast ratio everywhere │
├──────────────────────┼──────────────────────────────────────────────────────┤
│ 3. Indian Brand Hue  │ High-trust Trust Blue (#2563EB) & WhatsApp (#25D366) │
├──────────────────────┼──────────────────────────────────────────────────────┤
│ 4. Calm Surfaces     │ Soft warm-white background (#F8FAFC), zero visual jar│
├──────────────────────┼──────────────────────────────────────────────────────┤
│ 5. Legible Scale     │ Base body 15px/22px, headings 20-28px, zero <12px text│
└──────────────────────┴──────────────────────────────────────────────────────┘
```

---

## 2. Color Palette & Semantic Tokens

### 2.1 Theme Palette (Light Mode — Default & Recommended)
Indian business owners predominantly operate in well-lit environments where clean, high-contrast light themes provide superior legibility.

```css
:root {
  /* Surfaces & Backgrounds */
  --sx-bg: #f8fafc;              /* Main Canvas (Slate 50) */
  --sx-surface-1: #ffffff;        /* Primary Cards & Modals */
  --sx-surface-2: #f1f5f9;        /* Secondary Cards & Inputs (Slate 100) */
  --sx-surface-3: #e2e8f0;        /* Hover States & Dividers (Slate 200) */
  --sx-elevated: #ffffff;         /* Floating Sheets & Tooltips */

  /* Borders */
  --sx-border: #e2e8f0;           /* Subtle Card Border */
  --sx-border-strong: #cbd5e1;    /* Input & Control Border */

  /* High-Contrast Typography */
  --sx-text: #0f172a;             /* Primary Text (Slate 900) - 13.8:1 Contrast */
  --sx-text-muted: #334155;       /* Secondary Body (Slate 700) - 7.5:1 Contrast */
  --sx-text-subtle: #64748b;      /* Timestamps & Labels (Slate 500) - 4.6:1 */

  /* Brand Accents */
  --sx-accent: #2563eb;           /* StratXcel Trust Blue (Blue 600) */
  --sx-accent-hover: #1d4ed8;     /* Blue 700 */
  --sx-accent-muted: rgba(37, 99, 235, 0.08);
  --sx-accent-on: #ffffff;        /* White text on accent */

  /* India & Platform Special Accents */
  --sx-whatsapp: #25d366;         /* Official WhatsApp Green */
  --sx-whatsapp-hover: #20bd5a;
  --sx-whatsapp-muted: rgba(37, 211, 102, 0.12);
  --sx-google-blue: #1a73e8;      /* Google Business Blue */

  /* Semantic Status Indicators */
  --sx-success: #16a34a;          /* Active / Verified (Green 600) */
  --sx-success-bg: rgba(22, 163, 74, 0.1);
  --sx-warning: #d97706;          /* Action Needed (Amber 600) */
  --sx-warning-bg: rgba(217, 119, 6, 0.1);
  --sx-danger: #dc2626;           /* Critical Risk / Broken (Red 600) */
  --sx-danger-bg: rgba(220, 38, 38, 0.1);
}
```

---

## 3. Typography & Responsive Scale

StratXcel uses **Instrument Sans** (Primary Sans-Serif) paired with system UI fallbacks for instant rendering across all Android and iOS hardware.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            TYPOGRAPHY SPECIFICATION                         │
├──────────────┬──────────┬─────────────┬────────────┬────────────────────────┤
│ Token Name   │ Size     │ Line Height │ Weight     │ Usage Example          │
├──────────────┼──────────┼─────────────┼────────────┼────────────────────────┤
│ Display XL   │ 28px     │ 34px        │ 800 (Bold) │ Top Hero Headline      │
│ Heading LG   │ 22px     │ 28px        │ 700 (Bold) │ Section Titles         │
│ Heading MD   │ 18px     │ 24px        │ 700 (Bold) │ Card Headers           │
│ Body Regular │ 15px     │ 22px        │ 400/500    │ Main Content & Reports │
│ Body Small   │ 13px     │ 18px        │ 500/600    │ Subtext & Metadata     │
│ Caption      │ 12px     │ 16px        │ 600 (Bold) │ Badges & Nav Labels    │
└──────────────┴──────────┴─────────────┴────────────┴────────────────────────┘
```

> **CRITICAL MOBILE RULE:** Never render body or instructional copy below `13px` on mobile screens. Micro-fonts (`9px` / `10px`) used in developer tools must never appear in customer UI.

---

## 4. Spacing, Borders & Elevation

- **Base Spacing Grid:** 4px baseline (`gap-1` = 4px, `gap-2` = 8px, `gap-3` = 12px, `gap-4` = 16px, `gap-6` = 24px).
- **Border Radii:**
  - `rounded-sx-sm`: 8px (Small chips, badges, inline controls).
  - `rounded-sx-md`: 12px (Cards, input fields, standard buttons).
  - `rounded-sx-lg`: 16px (Hero banners, modal containers, bottom sheets).
  - `rounded-sx-pill`: 999px (Floating action buttons, status pills).
- **Shadows:**
  - `shadow-sx-sm`: `0 1px 3px rgba(15, 23, 42, 0.05)` (Subtle card resting state).
  - `shadow-sx-md`: `0 4px 12px rgba(15, 23, 42, 0.08)` (Card hover / active state).
  - `shadow-sx-float`: `0 12px 32px rgba(15, 23, 42, 0.12)` (Bottom dock & modals).

---

## 5. Component Specifications

### 5.1 Mobile Bottom Dock (`MobileBottomNav.tsx`)
- **Container:** `fixed bottom-0 inset-x-0 h-16 bg-white/95 backdrop-blur-md border-t border-slate-200 z-40`.
- **Items (5 Slots):**
  - Min touch target: `48px x 48px`.
  - Active state: Blue `#2563EB` icon with light-blue pill background + bold label.
  - Inactive state: Slate `#64748B` icon with regular label.
  - Active notification dot: Green `6px` pulsing badge.

```tsx
// Example Mobile Nav Item
<button className="flex flex-col items-center justify-center min-h-[48px] min-w-[48px] gap-1 active:scale-95 transition-transform">
  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-600">
    <HomeIcon />
  </span>
  <span className="text-[12px] font-bold text-blue-600">Home</span>
</button>
```

---

### 5.2 The 1-Tap Action Card (`UrgentActionCard.tsx`)
Used on Home and Audit screens to present clear, immediate tasks.

```tsx
<div className="flex items-center justify-between p-4 rounded-sx-md border border-slate-200 bg-white shadow-sx-sm hover:border-blue-400 transition-colors">
  <div className="flex items-center gap-3.5">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 text-lg">
      ⭐
    </div>
    <div>
      <h4 className="text-[15px] font-bold text-slate-900">Reply to 2 New Google Reviews</h4>
      <p className="text-[13px] text-slate-600">Customers praised your quick service. Send thank-you note.</p>
    </div>
  </div>
  <button className="shrink-0 min-h-[40px] px-4 rounded-sx-sm bg-blue-600 text-white text-[13px] font-bold shadow-sm hover:bg-blue-700 active:scale-95">
    Reply Now →
  </button>
</div>
```

---

### 5.3 WhatsApp Floating & Action Buttons
- **Primary WhatsApp Button:** `#25D366` background, `#FFFFFF` bold text, WhatsApp speech icon.
- **Floating Support Trigger:** Fixed bottom-right `bottom-20 right-4 md:bottom-6 md:right-6` for immediate 1-tap support access.

```tsx
<a
  href="https://wa.me/919825000000?text=Hi%20StratXcel%2C%20I%20need%20help%20with%20my%20business%20audit"
  target="_blank"
  rel="noopener noreferrer"
  className="inline-flex items-center gap-2 min-h-[46px] px-5 rounded-sx-pill bg-[#25D366] text-white text-[14px] font-bold shadow-md hover:bg-[#20BD5A] active:scale-95 transition-transform"
>
  <WhatsAppIcon className="w-5 h-5 fill-current" />
  <span>Send to WhatsApp</span>
</a>
```

---

### 5.4 Form Controls & Indian Phone Input
- **Input Height:** `44px` on mobile (`min-h-[44px]`) to prevent iOS/Android zoom-in.
- **Phone Number Field:** Fixed `+91` prefix with automatic 10-digit formatting.

```tsx
<div className="flex rounded-sx-md border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-blue-500 overflow-hidden">
  <span className="flex items-center px-3 bg-slate-100 border-r border-slate-300 text-[14px] font-bold text-slate-700">
    🇮🇳 +91
  </span>
  <input
    type="tel"
    placeholder="98250 12345"
    maxLength={11}
    className="w-full px-3.5 py-2.5 text-[15px] font-semibold text-slate-900 outline-none"
  />
</div>
```

---

### 5.5 Currency & Pricing Formatting (₹ INR)
All prices must strictly use the standard Indian Rupee symbol `₹` with standard Indian numeric grouping (`₹4,999`, `₹9,999`, `₹1,99,999`).

```typescript
export function formatINR(cents: number): string {
  return `₹${(cents / 100).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;
}
```

---

## 6. Feedback, Empty & Error States

- **Empty State Rule:** Never show a blank card with "No data available". Always provide:
  1. Friendly illustration / icon.
  2. Clear 1-sentence explanation.
  3. Action button (e.g. `[✨ Generate First Post]`, `[Connect Google Maps]`).
- **Network Resilient Banner:** In case of slow 2G/3G connectivity, show a non-blocking toast: *"Reconnecting to StratXcel... Showing cached results."*
