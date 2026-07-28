# Social Autopilot design reference

`references/copilot-workspace-reference.html` is the canonical **visual**
reference for Social Autopilot UI work (Command Center, Agent/Copilot,
Brand Brain, and related admin surfaces). It is stored verbatim, exactly as
provided — do not edit its markup/content when using it for reference.

## How to use it

- Open it in a browser to see the intended hierarchy, spacing, density,
  motion, and panel composition for a given surface before building or
  changing UI.
- It is a **visual concept**, not code to copy-paste. The real design
  tokens/system live in `app/admin/social/**` as CSS custom properties
  (`--saut-*`) plus the shared components in `app/admin/social/components/`
  (`StatusBadge`, `PlatformIcon`, `EmptyState`, etc.) and the Agent
  components in `app/admin/social/agent/` (`AgentMessage`, `AgentMarkdown`).
  Those are the real implementation system — this file uses a different
  token style (`--sx-*`) and is not wired into the app.
- Production functionality, accessibility, and existing behavior always
  override decorative details shown in the reference.
- Never copy placeholder/mock data shown in the reference (example metrics,
  example copy, example account names) into the real app as if it were real
  data.

## When to consult it

Before making Social Autopilot UI/UX changes, look here first for layout and
composition ideas, then implement using the actual `--saut-*` tokens and
existing shared components.

## Copilot agent workspace principles

The full-page Copilot uses three intentionally unequal areas:

- **Session Rail** — compact navigation for real persisted conversations.
- **Work Canvas** — the dominant conversation, work-card, artifact, and approval surface.
- **Progress / Context Rail** — real execution events, accessed context, artifacts, and connected-system identity.

Progress is operational telemetry only. It shows events persisted when real
operations occur; it never invents future steps, percentages, or tool output,
and it never exposes private model reasoning, hidden prompts, or chain-of-thought.
Known future steps are shown only when a persisted workflow actually defines them.

The external reference is inspiration for information hierarchy and density
only. Stratxcel's `--saut-*` tokens, accessibility behavior, shared components,
real data, and security rules are authoritative.

## Application-shell and workspace behavior

`/admin/social/*` is a fixed-height application shell, not a long document:
the top bar and navigation remain in place while each route owns its internal
scroll area. On desktop the navigation defaults to a compact icon rail,
expands as a non-jittering overlay on hover or keyboard focus, and can be
pinned as an explicit persisted preference. Mobile uses a drawer.

Copilot's Session Rail and Progress / Context Rail can be collapsed and resized
with pointer or keyboard controls. Widths are presentation preferences stored
locally; conversation content and files remain server-side. The Work Canvas
always keeps the minimum useful width. Mobile renders Chat, Progress, and
Context as separate tabs rather than compressing three columns.

## Attachments and safety boundaries

Copilot attachments are real private objects in owner-scoped Supabase Storage
with owner-scoped metadata and RLS. Supported text types may be extracted into
Agent context. Images and PDFs remain visible stored artifacts unless a real
parser or multimodal provider is configured; the UI and telemetry never imply
that unread content was analyzed. Attachment telemetry is emitted only when
extracted content is actually supplied to a run.

Autonomy and publishing safety are separate controls. Autonomy determines
whether safe internal work needs approval. SHADOW mode is the authoritative
provider-boundary gate: it blocks every external mutation even when autonomy
is AUTOPILOT. A blank budget means not configured, zero means explicitly
disabled, and a positive value is a configured limit.
