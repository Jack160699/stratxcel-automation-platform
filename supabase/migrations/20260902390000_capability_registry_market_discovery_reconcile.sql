-- Reconciles a pre-existing NOT_BUILT row (capability:market_company_discovery)
-- with this session's more specific capability:market_discovery finding --
-- both describe the same real gap; the specific blocker (an unauthorized
-- Apollo.io connector) is now recorded on both. Applied live via Supabase
-- MCP on 2026-09-02; this file makes that reproducible from a fresh
-- database.
update public.capability_registry
set status = 'EXTERNAL_REQUIRED',
    external_blocker = 'apollo_io_oauth_authorization_required',
    status_notes = status_notes || ' UPDATE 2026-09-02 (later pass, same day): re-audited alongside a fresh capability:market_discovery finding -- a real, relevant provider (claude.ai Apollo.io connector) is available in this environment but requires interactive OAuth no agent session can perform. Reclassified from NOT_BUILT to EXTERNAL_REQUIRED to reflect the real, specific, named blocker rather than a generic "not built" -- see capability:market_discovery for the full investigation.',
    last_verified_at = now(),
    last_verified_by = 'claude_session_2026-09-02'
where capability_key = 'capability:market_company_discovery';
