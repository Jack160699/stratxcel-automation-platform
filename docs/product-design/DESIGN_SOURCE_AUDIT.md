# Design Source Audit

Status: design documentation only. No application code, migrations, environment variables, integrations, or workers were touched to produce this file. See `README.md` for the full package index.

## 1. Source-file discrepancy (read this first)

The task referred to an uploaded **"Design system reference.zip."** No zip file exists anywhere on disk in this worktree or environment — it was searched for and not found. What was actually provided in the conversation is a single file, **`Stratxcel Social Autopilot Design System.html`**, which is a self-contained Claude-artifact export (it carries the `__bundler/manifest`, `__bundler/template`, and `data-dc-script` markers used by Anthropic's artifact bundler, plus base64-inlined Instrument Sans / JetBrains Mono woff2 fonts and a React/Babel runtime for its live density-toggle control).

That file is not a folder of separate design assets — it is one HTML document whose `__bundler/template` script tag contains the **entire** rendered page as an HTML string: brand, color, type, spacing, layout, surfaces, AI language, states, components, metrics, charts, platforms, motion, voice, accessibility, responsive rules, tokens, and worked examples, in that order, as 20 numbered sections. That string was read in full — not just the SVG thumbnail that renders before the bundler unpacks it — and is the source this entire documentation package is built from.

**Action needed from the business:** if a separate zip with additional files (e.g. Figma exports, a second breakpoint set, brand guideline PDFs) was intended to be attached and wasn't, say so and it can be incorporated in a follow-up pass. Everything below is scoped to what the HTML document actually contains.

## 2. Approved design system, extracted in full

### 2.1 Brand hierarchy
| Layer | Role | Presentation |
|---|---|---|
| **Stratxcel** | Parent brand | Always primary weight, uppercase, 0.10–0.14em tracking. Never omitted. |
| **Social Autopilot** (and future products) | Product name | Secondary weight, beneath the parent wordmark, or compressed to a mono chip (e.g. `AUTOPILOT`) in tight spaces. |
| **Command Center** (and other experience names) | Experience label | Contextual eyebrow/page-title text only — **never** a logo, never in the primary lockup. |

Lockups:
- **Primary** (login, marketing, app `<title>`): 34px gradient mark (150deg, `#4FDCE5` → `#3AA0FF` 45% → `#3B5BF5`) + "STRATXCEL" (17px/600/0.12em) + "Social Autopilot" (12px/#98A4B7/0.06em) stacked beneath. Clear space = mark height ÷ 2.
- **Sidebar/header**: 24px mark + "STRATXCEL" (14px/600/0.10em) + product chip (mono, 10px, `AUTOPILOT`, cyan-on-cyan-10%).
- **Compact/collapsed** (64px rail, favicons, avatars): 32px gradient mark, or monogram fallback `SX` / product monogram `SA` in a 32px bordered tile.
- Browser `<title>` pattern: `{Page} — Stratxcel` (root shell) or `{Experience} · Stratxcel` — the reference example shows `Command Center · Stratxcel`.
- **Never**: "Autopilot by Stratxcel™" or any suffixed/trademarked hybrid name.

### 2.2 Color system
Neutral ramp (cool navy bias, hue ~250–258, all values exact from source):

| Token | Hex | oklch | Role |
|---|---|---|---|
| canvas | `#06080C` | oklch(.16 .012 258) | App background |
| surface-1 | `#0B0E14` | oklch(.19 .014 258) | Default panel |
| surface-2 | `#11151D` | oklch(.23 .015 258) | Nested card, inputs |
| surface-3 | `#171C26` | oklch(.27 .016 258) | Segmented-control track |
| elevated | `#1F2632` | oklch(.31 .017 256) | Dropdown, popover, modal fill |
| border (subtle) | `#1D2431` | — | Default 1px border |
| border-strong | `#2C3543` | oklch(.38 .020 256) | Input border, active pagination |

Brand accents:

| Token | Hex | oklch | Role |
|---|---|---|---|
| accent | `#3AA0FF` | oklch(.70 .155 250) | Primary action, active nav, selection |
| accent-hover | `#6BBBFF` | oklch(.78 .115 249) | Hover on accent surfaces |
| accent-muted | `rgba(58,160,255,.14)` fill / `.30` border | — | Chips, tinted rows |
| royal (secondary) | `#3B5BF5` | oklch(.55 .215 266) | Second chart series only |
| AI/cyan | `#4FDCE5` | oklch(.84 .105 200) | AI activity exclusively |

Semantic:

| Token | Hex | Role |
|---|---|---|
| success | `#35C98C` | Published/active/success delta |
| warning | `#F0B429` | Needs review/attention |
| danger | `#F2565F` | Error/failed/destructive |
| learning | `#A78BFA` | **Restricted to the Learning AI state only** — the only violet in the system |
| offline | `#6B7684` | Paused/disconnected/idle |

Text:

| Token | Hex | Contrast on canvas |
|---|---|---|
| text primary | `#E9EDF3` | 15.1:1 |
| text secondary | `#98A4B7` | 7.2:1 |
| text tertiary | `#667384` | 4.6:1 — **≥12px only** |
| accent on canvas | `#3AA0FF` | 6.9:1 |

Hard rules: accent fills always take `#0A0D12` text, never white. Status is never colour-only — every status pairs a glyph/shape with a word.

### 2.3 Typography
Two families only: **Instrument Sans** (UI, 400/500/600/700) and **JetBrains Mono** (anything the machine produced: IDs, timestamps, token values, metrics, status text). Fallbacks: `'Helvetica Neue', Helvetica, system-ui, sans-serif` / `ui-monospace, SFMono-Regular, Menlo, monospace`.

| Style | Size/Line | Weight | Tracking | Usage |
|---|---|---|---|---|
| Display | 40/48px, 1.05 | 600 | −0.035em | Login, onboarding, empty hero |
| H1 page title | 28px, 1.15 | 600 | −0.025em | One per page, top-bar region |
| H2 panel title | 22px, 1.2 | 600 | −0.02em | Major operational panels |
| H3 card title | 18px, 1.3 | 600 | −0.015em | Cards, modals, sheets |
| H4 subsection | 15px, 1.35 | 600 | 0 | Grouped rows, form groups |
| Section label | 11px, 1.4 | 500 mono | 0.16em, upper | Divides dense regions |
| Body large | 16px, 1.55 | 400 | 0 | AI explanations, onboarding copy |
| Body (default) | 14px, 1.5 | 400 | 0 | Everything not otherwise specified |
| Body small | 12.5px, 1.5 | 400 | 0 | Helper text, table meta |
| Label | 11.5px, 1.4 | 500 | 0.10em, upper | Form labels, metric captions |
| Metric | 32–38px, 1.0 mono | 500 | −0.025em | `tabular-nums` always |
| Status/mono | 10.5px, 1.4 | 500 | 0.10em, upper | Badges, chips, IDs, timestamps |

### 2.4 Spacing
4px base, 8px rhythm. Scale: **4·8·12·16·20·24·32·40·48·64** (xs → 6xl). 64 is reserved for marketing/login composition only — never inside the product shell.

| Region | Value |
|---|---|
| Card padding | 20px default · 16px compact · 24px hero |
| Page margin | 32 desktop · 24 tablet · 16 mobile |
| Form field | 36px height · 12px inner pad · 12px row gap |
| Table | 40px row · 16px cell x-pad · 12px header pad |
| Sidebar | 12px x-pad · 2px item gap · 20px group gap |
| Mobile | 16px gutter · 12px card gap · 56px tab bar |

### 2.5 Layout & shell
Four fixed regions: rail/sidebar, top command bar, primary workspace, right context panel.

| Region | Value |
|---|---|
| Sidebar expanded | 248px |
| Sidebar collapsed | 64px |
| Top bar | 56px |
| Context panel | 320px (380px alt) |
| Content max-width | 1440px |
| Reading max-width | 720px |
| Grid | 12 col, 24px gutter |
| Mobile tab bar | 56px + safe-area |

Breakpoints: **1440+** full shell, context panel pinned · **1280** context panel becomes overlay · **1024** sidebar auto-collapses to rail · **768** rail → drawer, tables → cards · **480** bottom tab bar, single column · **360** minimum supported, 16px gutter holds.

### 2.6 Surfaces
Elevation is a one-step lightness change + 1px border — **not** shadow. Shadow is reserved for things that genuinely float: dropdown, tooltip, modal, sheet.

| State | Spec |
|---|---|
| Operational panel | surface-1, border subtle, r10, no shadow |
| Secondary/nested card | surface-2 |
| Elevated (dropdown/popover) | `#1F2632` bg, `#2C3543` border, r10, shadow-lg |
| Interactive card (hover) | border brightens to `#3A4453`, 1px lift, 140ms ease — **no scale** |
| Selected | accent border + 3px inset-left marker + 3px accent ring at 10% |
| AI-active card | cyan top hairline (gradient) + 7% cyan wash — **at most one per view** |
| Critical alert card | 3px danger inset-left bar; body text stays neutral; `role="alert"` |
| Modal/sheet | r14, shadow-xl, scrim `rgba(4,6,10,.72)` + 2px blur |

Radii: **6** chip · **8** control · **10** card · **14** modal · **999** pill. Borders: subtle `#1D2431`, strong `#2C3543`, always 1px.

### 2.7 AI visual language
Exactly three primitives carry all AI presence: a 6px pulse dot, a mono state line, and a cyan hairline on the surface being worked. **No faces, no sparkles, no mascots.**

| State | Dot | Motion | Notes |
|---|---|---|---|
| Observing | `#6B7684` | none | Idle, listening |
| Analyzing | `#4FDCE5` | pulse 1.6s | |
| Planning | `#4FDCE5` | pulse 1.6s | Stage 2/4 on workflow rail |
| Generating | `#3AA0FF` | pulse 1.2s (faster) | + shimmer on the target card |
| Scheduling | `#3AA0FF` | solid, no pulse | Time shown in mono |
| Publishing | `#35C98C` | pulse 1.2s | **Only state allowed to use success while active** |
| Measuring | secondary/gray | none | Charts animate in instead |
| Learning | `#A78BFA` | pulse 2.4s (slowest) | **Only violet in the system** |

Workflow rail: dot–line–dot pattern, completed segments green, active segment cyan glow ring, future segments border-strong gray, stage labels in mono uppercase beneath. Confidence indicator: 5-segment bar, cyan fill for confidence level, numeric mono value; **below 0.60 requires review before the card can act**. Processing bar: indeterminate = 3px track with animated cyan sweep (1.8s linear, "unknown duration only"); determinate = solid accent fill + mono %.

### 2.8 State chips
24px tall, pill radius, mono uppercase 10.5px. Fill = state colour at 10%, border at 24–32%, text full colour. **Shape differentiates as well as colour** (circle/square/triangle/diamond/dashed) so status is never colour-only.

Autopilot system state: Active (green pulse circle) · Paused (gray filled square) · Learning (violet pulse circle) · Waiting (accent ring outline) · Attention required (amber triangle) · Error (danger rotated-square/diamond) · Offline (dashed border, gray ring).

Content pipeline state: Idea (neutral, r6) · Generating (cyan pulse, r6) · Draft (dashed border, r6) · Ready (accent, r6) · Scheduled·time (accent, r6) · Publishing (success pulse, r6) · Published (success check, r6) · Needs review (amber, r6) · Failed (danger, r6).

### 2.9 Controls
32px default control height (28 sm / 36 lg / mobile), r8, 1px border, 140ms transitions, 2px accent focus ring at 2px offset always. Buttons: primary (accent fill, `#0A0D12` text, 600) · secondary (border+surface-3, 500) · ghost (transparent, 500) · destructive (danger-tinted) · icon-only (32×32 + tooltip) · disabled (dimmed, no pointer). Inputs 36px, surface-2 bg, border `#2C3543`, focus = accent border + 3px accent ring at 16%. Nav: active row = 34px, accent-12% bg, 2px inset-left accent bar, accent icon; inactive = secondary text, hover → surface-2; nested items 30px with 3px dot bullet, section labels mono uppercase 9.5px `#4B5666`. Tabs = 2px accent underline; segmented control = 2px-padded pill container; switch = 34×20 pill; skeleton = surface-2 base, 1.4s linear shimmer, **"never a spinner over 400ms of content."**

### 2.10 Metrics
Mono, `tabular-nums`, number first / label above (uppercase caption) / delta below (arrow + colour + stated comparison window, e.g. "vs prev 30d"). **Never more than 4 primary metrics in a row.** Rounding: <10K exact, 10K–1M one decimal, >1M two decimals. Deltas use `pp` for rate metrics, not `%`. Inverted metrics (unfollows, failures): down is good — colour follows meaning, not direction. Empty data shows `—` in tertiary, never `0`.

### 2.11 Charts
Horizontal grid lines only, `#1D2431`, no chart borders, no legend when a label will do. Max two series in brand colour (accent, then royal `#3B5BF5`); further series step down to neutral. Area+line: 1.8px accent stroke + gradient fill 26%→0%, last-point marker dot. Stacked bar: accent + royal + neutral, 2px cap radius. Sparkline: inline 100×24 beside label/value/delta. Radial progress: 48×48, 19px radius, 5px stroke, accent progress on elevated track.

### 2.12 Platforms & iconography
Channel tile: 28px r8 **neutral** bg+border with the platform's official monochrome glyph (never brand-coloured background). Platform identity shows only as a 2px identity bar (real brand gradient at 75% opacity) or a small dot — never as a card background or button fill. Disconnected = neutral bar, dimmed glyph, accent "Connect" link. Icon style: 1.4px stroke, round joins, 18px optical grid. Sizes: 16px chips/cells, 18px sidebar/buttons, 20px top bar, 24px empty-states only. Icons inherit text colour; accent icon colour reserved for the active nav item and AI states.

### 2.13 Motion
| Interaction | Duration/curve |
|---|---|
| Hover/focus | 120–140ms ease-out |
| Dropdown/tooltip | 120ms fade + 4px rise |
| Modal/sheet | 200ms `cubic-bezier(.2,.8,.2,1)` |
| Page/tab change | 160ms fade, **no slide** |
| Chart draw-in | 400ms once, first paint only |
| Live pulse | 1.2–2.4s loop, opacity+scale only |
| Success feedback | 180ms colour flash then settle |

Never: bounce, spring, parallax, scale > 1.02. Everything collapses under `prefers-reduced-motion`.

### 2.14 Density
Three modes, padding/row-height only (font size shifts ≤1px, controls never below 28px): **Comfortable** (48px rows, 24px card pad) for onboarding/settings/single-record · **Default** (40px rows, 20px card pad, 14px body) — ships as the product default · **Dense** (32px rows, 16px card pad, 13px body) for content pipeline/inbox/logs.

### 2.15 Voice
Present tense, states the subject: *"Autopilot is analyzing today's engagement."* Fact then the one action: *"Paused 12 minutes ago. Resume to continue publishing."* Actions are imperative verb+object: *"Approve post," "Pause autopilot," "Reconnect account."* Statuses are 1–2 words, no punctuation. AI explanations are exactly one "because …" sentence citing the signal: *"Because Tuesday 14:00 reached 2.3× median."* Errors state what happened, what it affects, what to do — never "Oops." Hype language (*"our revolutionary neural engine!"*) is explicitly called out in the source as the wrong example.

### 2.16 Accessibility
Body ≥4.5:1, secondary ≥7:1 on canvas, tertiary reserved for ≥12px non-essential meta. 2px accent focus ring at 2px offset on every interactive element including cards. Status always glyph+word, dot **shape** differs per state. Touch targets ≥44px mobile; 32px desktop controls get 8px invisible hit-area padding. Live regions `aria-live="polite"`; the agent state line specifically is called out as `aria-live="polite"`.

### 2.17 Responsive behaviour
| Element | Rule |
|---|---|
| Sidebar | 248px → 64px rail @1024 → drawer @768 |
| Top bar | keeps search + agent status; secondary actions collapse into `⋯` |
| Cards | 4-up → 2-up @1024 → 1-up @480; padding 20→16 |
| Tables | become stacked rows @768 (title + status chip + one metric) |
| Charts | drop grid labels <480, keep last-value marker |
| Modals | become bottom sheets @768 with a 4px grab handle |
| Filters | collapse into a single "Filter" button opening a sheet |
| Calendar | month view → agenda list on mobile |
| Context/Agent panel | pinned → overlay @1280 → dedicated Agent tab on mobile |

### 2.18 Design tokens
Full `--sx-*` namespace and Tailwind mapping is in `DESIGN_TOKEN_IMPLEMENTATION_MAP.md` — extracted verbatim from the source's own token section, values not altered.

## 3. Comparison against every current surface

| Surface | Current state | Gap vs. approved system |
|---|---|---|
| `stratxcel.in` (`app/(marketing)/*`, `app/page.tsx`) | Separate "journey" visual language: Geist Sans/Geist Mono, `--sx-void #05070e`, `--sx-glow #45c4ff`, `--sx-ember #ff6a3d`, cursor-hidden WebGL "press start" experience, film-grain/vignette overlays, 200-weight display type (`app/globals.css:1-195`). | Wrong fonts (Geist, not Instrument Sans/JetBrains Mono). Wrong canvas (`#05070e`, not `#06080C`). Existing `--sx-*` **token names already exist but hold different values** — this is a direct collision, not a greenfield namespace. No shared brand lockup with the product. Marketing has no defined relationship to `/admin` or a future `/app` today. |
| `/admin` (`app/admin/(shell)/*`) | Phase 1 unified shell. Raw Tailwind slate utilities throughout (`bg-slate-900/40`, `border-slate-800`, `text-slate-400`, confirmed in `page.tsx`, `layout.tsx`, `platform/*`) — no design-token layer at all. Has its own `AppShell.tsx`, `ClientSwitcher.tsx`. Command Center already resembles the target IA loosely (metric cards, mission/approval lists) but with no AI-state language, no chips per spec, no mono numerals. | Exactly the "raw slate-* styling" the brief explicitly says not to accept as final. No `--sx-*` tokens. No AI pulse-dot language anywhere. No chip system. Sidebar behavior (hover-expand, pin, tooltips) not implemented — nothing exists yet. |
| `/admin/social` (`app/admin/social/*`) | A second, independent shell (`SocialShell.tsx`, `social-theme.css`) with its own nav (`nav.ts`), its own Copilot UI, its own AdminLogin fallback. Deliberately NOT nested under `(shell)` to avoid double-wrapping (see `layout.tsx:22-27` comment). | This is the literal "two separate products" problem named in the brief. Two shells, two auth-gate copies, two visual languages, no shared chrome. `social-theme.css` has not been inspected line-by-line in this pass but is architecturally separate by design. |
| `/admin/social/copilot` | Part of the Social Autopilot shell above; has its own `CopilotProvider`/`CopilotContext`. | Same shell fragmentation as above. Copilot is Social-Autopilot-scoped only — there is no equivalent Copilot surface in the new unified shell or a future `/app`. |
| Phase 1 Preview branch (`feat/unified-command-center-phase-1`, current branch) | Fixed a real security defect (service-role client used for user reads — see prior commit `b5800e1`) and stood up a tenant switcher, but did **not** implement any part of the approved visual system. Still slate-*, still no `/app`, still two shells. | Confirms the brief's framing: Phase 1 solved tenant *resolution*, not tenant *presentation*. This design package is the next, distinct phase. |
| `/app` (client workspace) | **Does not exist.** No route, no layout, no components. | Entire IA is new — see `CLIENT_APP_INFORMATION_ARCHITECTURE.md`. |

## 4. Load-bearing conflict to flag explicitly

`app/globals.css` already defines a `--sx-*` custom-property block (`--sx-ink`, `--sx-brand`, `--sx-accent`, `--sx-surface`, `--sx-white`, `--sx-void`, `--sx-glow`, `--sx-ember`) for the existing marketing "journey" experience. The approved design system also mandates a `--sx-*` namespace, with different names and different values for nearly every overlapping concept (e.g. `--sx-accent` currently `#3b82f6`, approved `#3AA0FF`). These cannot coexist as written — implementation must either retire the old `--sx-*` block entirely in favor of the new one, or the marketing "journey" pages must be brought onto the new token set as part of migration (see `CURRENT_TO_FINAL_MIGRATION_PLAN.md`). This is a business/design decision, not something resolved by this documentation pass — flagged again in the final report.
