-- Registers generate_image -- Hermes' fifth real tool, the first with a
-- genuine per-call cost, plus the new real per-mission budget gate this
-- required (assertWithinBudget, wired into native-adapter.ts for the
-- first time). Applied live via Supabase MCP on 2026-09-07; this file
-- makes it reproducible from a fresh database.

insert into public.capability_registry (
  capability_key, name, description, category, department,
  agent_tool_name, read_write, tenant_scope, cost_profile, risk, verification_method,
  status, status_notes, last_verified_at, last_verified_by
) values (
  'capability:hermes_creative_studio_exposure',
  'Hermes missions can now generate real, real-cost images -- generate_image, plus a new real per-mission budget gate',
  'Fifth tool in the "expose existing StratXcel systems to Hermes" series, and the first with a genuine per-call cost -- deliberately deferred earlier (see capability:hermes_crm_single_lead_read''s status_notes) until it could get a proper pass rather than the same fast cadence as the read-only additions. Reuses executeGenerateImageTool (lib/social/agent/generate-image-tool.ts) completely unmodified with its real default production dependencies -- the exact same real function lib/agent-core/growth-media-tools.ts''s own generate_image tool already calls, including its real tenant monthly AI budget gate (unchanged, not bypassed). Billing/asset attribution uses the mission''s real creator (missions.created_by) as the actor, refusing honestly rather than fabricating one if a mission somehow has none. Built the missing piece this required: assertWithinBudget (packages/hermes/src/budget.ts) existed as a real function but was never actually wired into the native adapter''s execution loop for ANY tool -- a real, honest "extension point, not a stub" per its own doc comment. Added a real TOOL_COST_ESTIMATES_CENTS map (native-adapter.ts) with generate_image''s first real entry (25 cents, conservative -- covers every real image tier in packages/ai-runtime''s cost catalog up to the most expensive premium-4K entry, $0.24, verified against that catalog directly), tracked spend across the mission''s own tool-calling loop, and a real pre-call refusal (never invokes the costed tool, reports the real reason back to the model) when a call would exceed the mission''s reserved budgetCents. This is now TWO independent, real budget gates for this one tool: Hermes'' own per-mission ceiling, and the tenant''s own monthly AI budget underneath it.',
  'hermes',
  'Engineering',
  'generate_image',
  'write',
  'tenant',
  'variable',
  'low_mutation',
  'packages/hermes/src/__tests__/native-adapter.test.ts (3 new scenarios, real and executable): a costed call within budget is genuinely invoked and its cost tracked, a second costed call that would exceed the remaining budget is refused BEFORE invokeTool is ever called (never a silent allow), and free tools remain completely unaffected even at zero budget. apps/hermes-gateway/src/__tests__/generate-image.test.ts (2 scenarios): the real Zod schema requires brief and forbids a smuggled tenantId, and the real handler source is confirmed to look up the real mission creator, refuse honestly when absent, pass the verified tenant only, and call the real production function with zero dependency overrides -- so the real tenant budget gate runs unmodified. Zero regressions across test:hermes-mission-control and the full test:foundation suite (66 files, includes every other hermes/mission/RBAC/payments test). Full-repo tsc --noEmit clean on the first pass, lint clean, real NODE_ENV=production build (exit 0).',
  'REAL_EXPOSED',
  'A real, deliberate, visible policy decision, not a silent default: generate_image was added to context.ts''s DEFAULT_TOOL_ALLOWLIST (every mission gets it) because it''s bounded by two independent real budget gates, HERMES_MODE stays disabled in production regardless of this change, and without it a mission could never accomplish the master brief''s own explicit acceptance-test capability ("create 30 days of social content"). Stated explicitly in context.ts''s own comment so the Founder can reverse it by removing the entry if they disagree. Fifth and last tool in this initial series -- see capability:hermes_growth_engine_exposure for the running list.',
  now(),
  'claude_session_2026-09-07'
);
