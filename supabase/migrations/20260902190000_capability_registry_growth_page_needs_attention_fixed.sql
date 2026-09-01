-- Records that the "What Needs Attention" gap flagged in the previous
-- migration is now ALSO fixed -- the card is real and mission-driven, not
-- left open. Applied live via Supabase MCP on 2026-09-02; this file makes
-- that reproducible from a fresh database.
update public.capability_registry
set status = 'REAL_EXPOSED',
    name = 'Growth dashboard mission outcome labeling AND What Needs Attention -- both now real and honest',
    status_notes = 'UPDATE 2026-09-02, same pass: closed the remaining gap too. "What Needs Attention" now derives a real needsAttentionMissions list (FAILED/BLOCKED/AWAITING_FUNDS/AWAITING_APPROVAL/AWAITING_INPUT/HUMAN_HANDOFF -- the real MissionState enum, matching the master build brief''s own spec) and renders real, specific per-mission callouts (service_key + goal_text + the real MISSION_STATE_CHIP label, linking to the real mission detail page) ahead of the generic evergreen tips, which now only show as a fallback when there is genuinely nothing mission-specific to report. CANCELLED and PARTIALLY_COMPLETED deliberately excluded (closed/dismissed state; already honestly surfaced in "What Improved" -- avoids double-counting the same mission in two cards). Verification: 2 new source-text assertions in customer-app-bugfixes-polish.test.ts (6/6 suites pass), full-repo tsc --noEmit clean, lint clean.',
    last_verified_at = now(),
    last_verified_by = 'claude_session_2026-09-02'
where capability_key = 'capability:growth_page_mission_outcome_labeling';
