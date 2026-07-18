# Stratxcel — Interactive Experience

The Stratxcel site is not a webpage — it's a cinematic, game-like journey.
The visitor presses **START**, then scrolls through seven scenes rendered by a
GPU particle field that morphs from the Stratxcel identity, through business
chaos, into one connected intelligent ecosystem. The journey ends at an
**EXPLORE** menu — the "main menu" of the site — with navigation and a contact
channel wired to Supabase.

## Stack

| Layer      | Tech                                                        |
| ---------- | ----------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Turbopack), React 19, TypeScript    |
| 3D / WebGL | Three.js + React Three Fiber, custom GLSL particle shaders  |
| Animation  | GSAP ScrollTrigger (scrubbed master timeline), Lenis smooth scrolling |
| Styling    | Tailwind CSS 4, Geist / Geist Mono                          |
| Backend    | Supabase (Postgres + Auth, RLS-protected)                   |
| Analytics  | Vercel Analytics                                            |
| Hosting    | Vercel                                                      |

## Architecture

```
app/
  page.tsx                    # home — SEO shell + client experience
  _experience/
    Experience.tsx            # orchestrator: Lenis, GSAP master timeline, gate, HUD
    CanvasStage.tsx           # R3F canvas: particle field, shaders, camera rig
    formations.ts             # particle formation targets (identity X, chaos, torus…)
    scenes.tsx                # DOM overlays for scenes 1–7
    StaticExperience.tsx      # reduced-motion / no-WebGL fallback (same story)
    content.ts                # narrative copy + scene timing (single source of truth)
    journey.ts                # shared per-frame state (no React re-renders)
    Cursor.tsx                # custom magnetic cursor
  (marketing)/                # post-EXPLORE destination pages (+ /contact)
  admin/                      # Supabase-Auth-protected console (contact inbox)
  actions/contact.ts          # server action → stratxcel_contact_messages
lib/supabase/                 # browser + server Supabase clients (@supabase/ssr)
proxy.ts                      # session refresh for /admin (Next 16 proxy)
scripts/verify-drive.mjs      # end-to-end browser verification (playwright-core)
```

**How the journey works.** One fixed WebGL canvas renders ~22k particles whose
positions morph between precomputed formations (`formations.ts`) as you
scroll. A single GSAP timeline, scrubbed by ScrollTrigger across a 780vh
track, drives every DOM overlay, SVG line-draw, counter and camera move from
the same progress value — so the film can never desync. Scroll progress,
pointer position and the press-start shockwave live in a mutable
`JourneyState` object shared with the render loop, bypassing React at 60fps.

**Accessibility & fallbacks.** `prefers-reduced-motion` or missing WebGL
renders the full story as a static page. All narrative text also ships
server-rendered for crawlers and screen readers. The canvas is `aria-hidden`;
every interactive element is keyboard-reachable.

## Setup

```bash
npm install
cp .env.example .env.local    # fill in Supabase URL + publishable key
npm run dev
```

### Environment variables

| Variable                        | Purpose                                  |
| ------------------------------- | ---------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project API URL                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable (anon) key          |
| `BOT_BACKEND_URL` *(optional)*  | Legacy WhatsApp lead-analytics backend for the admin panel |

### Database

Tables (created via Supabase migration `stratxcel_site_contact_and_admins`):

- `stratxcel_contact_messages` — contact form submissions. RLS: anyone can
  insert; only admins can read/update.
- `stratxcel_admins` — user ids allowed into `/admin`. RLS: self-read only.

To grant another user admin access: create them in Supabase Auth, then
`insert into stratxcel_admins (user_id) values ('<their-uuid>');`

## Admin

`/admin` — Supabase email/password login. Admins see the contact inbox
(mark read / replied / archived) and, when `BOT_BACKEND_URL` is set, the
WhatsApp lead-analytics dashboard.

## Verification

With a production build running locally:

```bash
npm run build && npx next start -p 3105
ADMIN_PASSWORD=... node scripts/verify-drive.mjs
```

Drives the real experience in headless Chrome: press start, all seven scenes,
contact submission (verified in Supabase), admin login (including a
wrong-password probe), status updates, reduced-motion fallback and mobile
viewport — and saves screenshots of every scene.

## Deployment

Pushed to GitHub → auto-deployed by Vercel. Set the two `NEXT_PUBLIC_SUPABASE_*`
environment variables in the Vercel project before the first build.
