# Approval and Handoff

## What always requires approval

By construction — not by prompt instruction, not skippable by any profile — the following tool
categories on the Stratxcel MCP tool server are marked `sensitive: true` and never execute
without a resolved `ApprovalDecision`:

- Production deploy / promotion (`mcp_stratxcel_vercel_promote_production`)
- Publishing to any public/client-facing channel (social posts, website content going live)
- Sending any outbound message to a real customer/lead (WhatsApp, email, CRM follow-up send)
- Any spend-adjacent action (Razorpay charges, refunds, proposal pricing outside configured
  floor/ceiling)
- Any destructive action (delete, overwrite without backup, revoke access)

This list is enforced server-side in the (not-yet-built) Stratxcel MCP tool server, keyed off
each tool's manifest, so it's a property of the tool registry, not of profile configuration —
a misconfigured profile cannot accidentally grant itself the ability to skip approval.

## Flow

1. Mission calls a `sensitive: true` tool.
2. Stratxcel MCP tool server does **not** perform the action. It writes an `ApprovalRequest`
   row (tenant, mission, tool, arguments, a human-readable summary, risk category) to
   Stratxcel's DB and returns a `pending_approval` `ToolResult` to Hermes.
3. Hermes' run either pauses (if using the Runs API's approval-pause behavior — see the open
   verification item in [API_CONTRACT.md](API_CONTRACT.md)) or the profile's skill/prompt
   instructs it to report the pending approval and stop attempting that branch of work,
   whichever behavior is confirmed once implemented.
4. A human reviews the `ApprovalRequest` in Stratxcel's (existing, untouched) admin UI and
   approves or rejects, producing an `ApprovalDecision`.
5. Stratxcel's integration layer delivers the decision back:
   - If approved and the run is genuinely paused: `POST /v1/runs/{run_id}/approval`.
   - If approved and the run already completed/reported pending: the action executes directly
     via the Stratxcel MCP server (the original tool call is replayed with the now-approved
     decision attached), and Stratxcel records this as a **new**, linked mission step — not a
     silent retroactive execution of the original tool call, so the audit trail always shows
     what was requested vs. what was ultimately approved and when.
6. Every step above is written to Stratxcel's audit log (see
   [OBSERVABILITY.md](OBSERVABILITY.md)) — request, decision, decider identity, timestamp,
   resulting action outcome.

## Rejection

A rejected `ApprovalDecision` is terminal for that specific tool call. The mission continues
(if other, non-blocked work remains) or completes with that step marked `rejected` in its
`ArtifactManifest`. Hermes is never told *why* in a way that would let it retry with a
rephrased request to bypass the same gate — rejection reason is recorded for the human audit
trail, not fed back as agent-actionable context by default.

## Human handoff (non-approval)

Separate from binary approve/reject: any mission can produce output explicitly marked
"needs human judgment" (e.g., ambiguous brief, missing required context) via the `clarify`
tool Hermes already provides natively, surfaced to Stratxcel as a mission status of
`needs_clarification` rather than `completed` or `failed`.

## What this branch does NOT build

The Stratxcel MCP tool server, the admin approval UI, and the DB tables for
`ApprovalRequest`/`ApprovalDecision` are **not implemented in this branch** — only the
`ApprovalRequest`/`ApprovalDecision` TypeScript contract types exist, in
`packages/hermes-contract`, ready for that future implementation.
