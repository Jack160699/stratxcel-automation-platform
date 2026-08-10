# Client App Information Architecture — `/app`

V1 customer workspace only. No Beta toggle. No `release: "v2"` items.
Implementation: `components/shell/navigation/app-nav-data.ts`.

## Customer journey framing
Find opportunity → Create demand → Capture lead → Follow up → Convert → Measure → Improve

## Nav groups (sidebar)

**Overview**
- Command Center (`/app`)

**Get things done**
- Copilot (`/app/copilot`)
- Work (`/app/missions`)
- Approvals (`/app/approvals`)

**Grow**
- Content & Media (`/app/content`)
- Website (`/app/website`)
- Search & SEO (`/app/search`)
- Leads & CRM (`/app/crm`)
- Ads (`/app/ads`)

**Results**
- Reports (`/app/reports`)

**Business**
- Brand Brain (`/app/brand`)
- Integrations (`/app/integrations`)
- Billing (`/app/billing`)
- Team (`/app/team`)
- Settings (`/app/settings`)

## Secondary V1 routes (contextual, not top-level)
Files, content studio/calendar/pipeline/analytics/automations, conversations, detail pages — reachable from hubs (e.g. Content & Media → Studio / Calendar / Pipeline / Analytics).

## Mobile primary
Home · Copilot · Work · Approvals — remaining modules in More.

## Command Center
Answers: what Stratxcel is doing, what changed, what needs approval, what is blocked, what should happen next — using real data only (missions, approvals, journey). No fabricated inbox/AI metric cards.

## Separation from admin
`/app` and `/admin` keep separate nav arrays. Customer HTML/JS must never expose Beta Mode, Operating Brain, or Hermes Mission Control.
