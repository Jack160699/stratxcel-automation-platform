# Design Token Implementation Map

Design documentation only — no CSS, Tailwind config, or component files were changed to produce this. Values are transcribed verbatim from the source document's own token section (`DESIGN_SOURCE_AUDIT.md` §2.18); nothing here is invented.

## 1. Namespace decision

The required namespace is `--sx-*`. `app/globals.css` already defines a `--sx-*` block for the marketing "journey" experience with **incompatible values** (`--sx-accent: #3b82f6` vs. the approved `#3AA0FF`, `--sx-void`/`--sx-glow`/`--sx-ember` with no equivalent in the approved system). Recommendation: the existing block is replaced wholesale by the table below, not merged. Two `--sx-*` namespaces with different meanings in the same codebase is not implementable safely. This is called out again in `CURRENT_TO_FINAL_MIGRATION_PLAN.md` as the first migration step, and needs explicit business sign-off since it changes the entire marketing site's look, not just `/admin`.

## 2. Color tokens

```css
:root {
  /* Canvas / surfaces */
  --sx-bg: #06080C;
  --sx-surface-1: #0B0E14;
  --sx-surface-2: #11151D;
  --sx-surface-3: #171C26;
  --sx-elevated: #1F2632;
  --sx-hover: #11151D;
  --sx-active: #1F2632;
  --sx-border: #1D2431;
  --sx-border-strong: #2C3543;

  /* Text */
  --sx-text: #E9EDF3;
  --sx-text-muted: #98A4B7;
  --sx-text-subtle: #667384;

  /* Brand accent */
  --sx-accent: #3AA0FF;
  --sx-accent-hover: #6BBBFF;
  --sx-accent-muted: rgb(58 160 255 / .14);
  --sx-accent-on: #0A0D12;      /* text color used ON accent fills */
  --sx-royal: #3B5BF5;           /* second chart series / secondary brand */
  --sx-ai: #4FDCE5;              /* AI activity — reserved, do not reuse elsewhere */

  /* Semantic */
  --sx-success: #35C98C;
  --sx-warning: #F0B429;
  --sx-danger: #F2565F;
  --sx-learning: #A78BFA;        /* Learning AI state only — nowhere else */
  --sx-offline: #6B7684;
}
```

State-colour triples (used by chips, AI states, alert cards) are generated, not hand-authored per component:

```css
--sx-{state}: <full colour>;
--sx-{state}-fill: <same colour at 10% alpha>;
--sx-{state}-border: <same colour at 24–32% alpha>;
```

## 3. Typography tokens

```css
--sx-font-ui: 'Instrument Sans', system-ui, sans-serif;
--sx-font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;

--sx-text-display: 600 40px/1.05 var(--sx-font-ui); letter-spacing: -0.035em;
--sx-text-h1:      600 28px/1.15 var(--sx-font-ui); letter-spacing: -0.025em;
--sx-text-h2:      600 22px/1.2  var(--sx-font-ui); letter-spacing: -0.02em;
--sx-text-h3:      600 18px/1.3  var(--sx-font-ui); letter-spacing: -0.015em;
--sx-text-h4:      600 15px/1.35 var(--sx-font-ui);
--sx-text-body-lg: 400 16px/1.55 var(--sx-font-ui);
--sx-text-body:    400 14px/1.5  var(--sx-font-ui);
--sx-text-sm:      400 12.5px/1.5 var(--sx-font-ui);
--sx-text-label:   500 11.5px/1.4 var(--sx-font-ui); letter-spacing: 0.10em; text-transform: uppercase;
--sx-text-mono:    500 10.5px/1.4 var(--sx-font-mono); letter-spacing: 0.10em; text-transform: uppercase;
--sx-metric:       500 34px/1.0 var(--sx-font-mono); letter-spacing: -0.025em; font-variant-numeric: tabular-nums;
```

## 4. Spacing, radius, control-height tokens

```css
--sx-space-1: 4px;  --sx-space-2: 8px;   --sx-space-3: 12px; --sx-space-4: 16px;
--sx-space-5: 20px; --sx-space-6: 24px;  --sx-space-7: 32px; --sx-space-8: 40px;
--sx-space-9: 48px; --sx-space-10: 64px; /* marketing/login composition only */

--sx-radius-xs: 6px;   /* chip */
--sx-radius-sm: 8px;   /* control */
--sx-radius-md: 10px;  /* card */
--sx-radius-lg: 14px;  /* modal */
--sx-radius-pill: 999px;

--sx-control-h: 32px;
--sx-input-h: 36px;
--sx-row-h: 40px;      /* default density */
```

## 5. Shadow, motion, z-index, breakpoint tokens

```css
--sx-shadow-sm: 0 1px 2px rgb(0 0 0 / .6);
--sx-shadow-lg: 0 12px 32px -12px rgb(0 0 0 / .85);
--sx-shadow-xl: 0 32px 64px -24px rgb(0 0 0 / .9);
--sx-ring: 0 0 0 2px var(--sx-accent);

--sx-dur-fast: 120ms;
--sx-dur-base: 160ms;
--sx-dur-slow: 200ms;
--sx-ease: cubic-bezier(.2, .8, .2, 1);
--sx-pulse: 1.6s ease-in-out infinite;

--sx-z-base: 0;      --sx-z-sticky: 10;   --sx-z-nav: 20;
--sx-z-dropdown: 40; --sx-z-sheet: 50;    --sx-z-modal: 60;
--sx-z-toast: 70;    --sx-z-tooltip: 80;

--sx-bp-sm: 480px; --sx-bp-md: 768px; --sx-bp-lg: 1024px;
--sx-bp-xl: 1280px; --sx-bp-2xl: 1440px;
```

## 6. Tailwind v4 mapping

The codebase already uses Tailwind v4's CSS-first config (`@import "tailwindcss"` + `@theme inline` in `app/globals.css` — confirmed, no separate `tailwind.config.*` file exists). The token block above stays as plain `:root` custom properties (source of truth), and a second `@theme inline` block re-exposes the ones Tailwind needs as utility-generating variables, exactly like the existing `--color-background` / `--color-foreground` pattern already in the file:

```css
@theme inline {
  --color-sx-bg: var(--sx-bg);
  --color-sx-surface-1: var(--sx-surface-1);
  --color-sx-surface-2: var(--sx-surface-2);
  --color-sx-surface-3: var(--sx-surface-3);
  --color-sx-elevated: var(--sx-elevated);
  --color-sx-border: var(--sx-border);
  --color-sx-border-strong: var(--sx-border-strong);
  --color-sx-text: var(--sx-text);
  --color-sx-text-muted: var(--sx-text-muted);
  --color-sx-text-subtle: var(--sx-text-subtle);
  --color-sx-accent: var(--sx-accent);
  --color-sx-accent-hover: var(--sx-accent-hover);
  --color-sx-royal: var(--sx-royal);
  --color-sx-ai: var(--sx-ai);
  --color-sx-success: var(--sx-success);
  --color-sx-warning: var(--sx-warning);
  --color-sx-danger: var(--sx-danger);
  --color-sx-learning: var(--sx-learning);
  --color-sx-offline: var(--sx-offline);

  --font-sx-sans: var(--sx-font-ui);
  --font-sx-mono: var(--sx-font-mono);

  --radius-sx-xs: var(--sx-radius-xs);
  --radius-sx-sm: var(--sx-radius-sm);
  --radius-sx-md: var(--sx-radius-md);
  --radius-sx-lg: var(--sx-radius-lg);
  --radius-sx-pill: var(--sx-radius-pill);
}
```

This yields utilities such as `bg-sx-surface-1`, `text-sx-text-muted`, `border-sx-border`, `rounded-sx-md`, `font-sx-mono` — a component author writes `className="bg-sx-surface-1 border border-sx-border rounded-sx-md"` instead of `bg-slate-900/40 border-slate-800 rounded-lg`. **No raw `slate-*`/`gray-*`/`blue-*` utility is permitted in `/admin`, `/app`, or shared shell components once migration lands** — this is the concrete, enforceable version of "do not approve raw slate-* styling as the final design system."

## 7. Fonts

Instrument Sans and JetBrains Mono are both variable-ish Google Fonts. The codebase already loads Geist/Geist Mono via `next/font/google` in `app/layout.tsx`; the same mechanism swaps in cleanly:

```ts
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";

const instrumentSans = Instrument_Sans({
  variable: "--sx-font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  variable: "--sx-font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});
```

No self-hosted woff2 files are needed — the artifact's embedded fonts were a self-containment requirement of the artifact format, not a hosting instruction; `next/font/google` is this codebase's existing, working pattern and should stay the mechanism.

## 8. Component-class conventions (naming only, not implementation)

To keep the token layer enforceable rather than aspirational:
- Status chips: `sx-chip sx-chip--{state}` → resolves fill/border/text from the `--sx-{state}` triple.
- AI pulse dot: `sx-pulse-dot sx-pulse-dot--{state}` → dot colour + `--sx-pulse`-based animation, `none` under `prefers-reduced-motion`.
- Density: a single `data-density="comfortable|default|dense"` attribute on the shell root, consumed by row-height/padding tokens — never a separate class per page.

## 9. What this does not cover

Actual `.css`/`.tsx` edits, a Tailwind `@theme` PR, or removal of the old `--sx-*` block are implementation work and out of scope for this documentation phase. See `IMPLEMENTATION_PHASES.md` for where token migration lands in the phased rollout.
