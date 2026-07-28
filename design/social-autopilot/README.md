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
