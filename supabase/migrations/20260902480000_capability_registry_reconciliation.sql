-- Final convergence pass: reconciles 6 stale capability_registry rows left
-- over from earlier in this engagement, once the gaps they described were
-- actually fixed by this session's later work (Updates 37-56) but the rows
-- themselves were never revisited. Applied live via Supabase MCP on
-- 2026-09-02; this file makes that reproducible from a fresh database.

update public.capability_registry
set status = 'REAL_EXPOSED',
    status_notes = status_notes || ' RECONCILED 2026-09-02 (final convergence pass): this row is now stale -- superseded by capability:revenue_diagnostics_pipeline (check_revenue_diagnostics), which wires this exact package to real inputs and is REAL_EXPOSED. Marking this row REAL_EXPOSED to match reality rather than leaving a duplicate stale REAL_NOT_EXPOSED record for the same package.',
    last_verified_at = now(), last_verified_by = 'claude_session_2026-09-02'
where capability_key in ('capability:revenue_ops_workflow_pipeline','engine:revenue_ops');

update public.capability_registry
set status = 'REAL_EXPOSED',
    status_notes = status_notes || ' RECONCILED 2026-09-02 (final convergence pass): the specific blocker named above (no function computes real BusinessSignals) was fixed in Update 37 -- computeRealBusinessSignals (lib/agent-core/business-signals.ts), now used by check_business_priorities, preview_growth_plan, and commit_growth_plan. The full pipeline (diagnoseBusinessGrowth -> deriveBottlenecks -> buildGrowthRecommendations/buildPlanRecommendations, inside planBusinessGrowth) is genuinely reachable end to end. Marking REAL_EXPOSED to match reality.',
    last_verified_at = now(), last_verified_by = 'claude_session_2026-09-02'
where capability_key = 'engine:priority_recommendations';

update public.capability_registry
set status = 'REAL_EXPOSED',
    status_notes = status_notes || ' RECONCILED 2026-09-02 (final convergence pass): this row records a defect that was fully fixed the same pass it was found, per its own notes -- the fabrication-free edit_website path has been REAL_EXPOSED (capability:edit_website_agent_tool) since Update 42. Correcting this row''s own status to match, so it does not read as an open item.',
    last_verified_at = now(), last_verified_by = 'claude_session_2026-09-02'
where capability_key = 'capability:website_edit_fabrication_defect';

update public.capability_registry
set status = 'EXTERNAL_REQUIRED',
    external_blocker = 'meta_whatsapp_template_approval_required',
    status_notes = status_notes || ' RECONCILED 2026-09-02 (final convergence pass): the tool itself is fully built and deployed -- the ONLY remaining piece is Meta''s own WhatsApp Business template-approval process for a cold first-contact message, a real external approval this agent cannot grant itself. Reclassified from a vague PARTIAL to the precise external blocker.',
    last_verified_at = now(), last_verified_by = 'claude_session_2026-09-02'
where capability_key = 'agent_tool:send_whatsapp_message_to_contact';

update public.capability_registry
set status = 'EXTERNAL_REQUIRED',
    external_blocker = 'supabase_auth_dashboard_leaked_password_protection_toggle',
    status_notes = status_notes || ' RECONCILED 2026-09-02 (final convergence pass): re-confirmed via direct attempt this pass -- auth.config is not queryable/writable via execute_sql (Supabase Auth settings are control-plane, not project-database, config). The Leaked Password Protection toggle genuinely requires Supabase Dashboard -> Authentication -> Policies access no available tool provides. Reclassified from PARTIAL to the precise external blocker; every other item this audit covered is closed.',
    last_verified_at = now(), last_verified_by = 'claude_session_2026-09-02'
where capability_key = 'capability:security_audit_pass';

update public.capability_registry
set status = 'EXTERNAL_REQUIRED',
    external_blocker = 'owner_authorization_required_to_enable_hermes_mode',
    status_notes = status_notes || ' RECONCILED 2026-09-02 (final convergence pass): the engineering side is complete -- create_mission, commit_growth_plan, and the real autonomy decision layer are all live. The remaining gap is deliberately NOT an engineering task: HERMES_MODE=disabled is a real, intentional production kill-switch, and flipping it to enable live autonomous mission execution is a business/safety decision requiring explicit owner authorization, not something this agent will do unilaterally (master brief itself: "do not bypass safety simply to call the feature complete"). Reclassified from PARTIAL to the precise external/authorization blocker.',
    last_verified_at = now(), last_verified_by = 'claude_session_2026-09-02'
where capability_key = 'engine:hermes_missions';
