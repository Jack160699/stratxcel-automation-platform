-- Registers the connector approval_required in-mission recovery message
-- (corrects Update 85's own overstated remaining-gap note). Applied live
-- via Supabase MCP on 2026-09-07; this file makes it reproducible from a
-- fresh database.

insert into public.capability_registry (
  capability_key, name, description, category, department,
  agent_tool_name, read_write, tenant_scope, cost_profile, risk, verification_method,
  status, status_notes, last_verified_at, last_verified_by
) values (
  'capability:connector_approval_required_routing',
  'A connector denial requiring Founder approval now tells the model exactly how to get it, in-mission -- corrects an earlier overstated gap',
  'When Update 85 shipped the connector authorization gate, its own status_notes said auto-routing an approval_required capability through the existing request_approval flow "is a real, separate, larger mission-state integration, not built here." Investigating that claim before starting a new subsystem found it was an overstatement: the mechanism already existed and already worked. apps/hermes-gateway/src/tool-handlers.ts''s invokeTool throwing (including ConnectorNotAuthorizedError) was ALREADY caught by packages/hermes/src/native-adapter.ts''s own tool-calling loop and turned into a per-call "error: ..." tool-result message, never crashing the mission -- and that same loop ALREADY treats a request_approval call as a real AWAITING_APPROVAL stop (missions.state, matching the real state machine''s AWAITING_APPROVAL -> RESUMED transition). The only genuinely missing piece was that the denial MESSAGE itself never told the model this recovery path existed for this specific reason, leaving it to guess or give up. Fixed precisely: ConnectorNotAuthorizedError now appends an explicit, actionable instruction (call request_approval with a real kind/subject, then retry the exact same tool call once approved; do not give up or fabricate a result) ONLY for the autonomy_approval_required_not_yet_auto_routed reason -- every other denial reason (not_connected/unhealthy/not_assigned/disabled) stays a plain, non-actionable denial, since those genuinely require an Admin action first and no in-mission retry can help; falsely suggesting request_approval would help there would be worse than saying nothing.',
  'hermes',
  'Engineering',
  'generate_image, check_domain_status (via the same HERMES_TOOL_CONNECTOR_MAP as Update 85)',
  'read_write',
  'tenant',
  'free',
  'low_mutation',
  'New apps/hermes-gateway/src/__tests__/connector-not-authorized-error.test.ts (2 scenarios, real executable assertions against the actual exported error class, not source-regex): an approval_required denial''s message names the real request_approval tool and explicitly says the original call is retryable after approval; every other denial reason''s message is confirmed to never mention request_approval (no false recovery promise) while still carrying the real reason string verbatim. Zero regressions across the full 12-file test:hermes-mission-control suite (including the pre-existing connectors.test.ts, unaffected since only the error MESSAGE changed, not invokeTool''s own control flow). Full-repo tsc --noEmit clean, lint clean, real NODE_ENV=production build (exit 0).',
  'REAL_EXPOSED',
  'This closes the actionability gap, not the underlying capability grant -- a Founder must still actually approve the request via the real, existing approvals surface for the mission to proceed; nothing here auto-approves anything. Per-agent granularity for the authorization gate itself remains a real, separate future task (missions still have no agent_definition_id), unchanged from Update 85.',
  now(),
  'claude_session_2026-09-07'
);
