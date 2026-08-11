-- Additive: allow SUPERSEDED status + optional review metadata indexes for
-- Social Copilot review revisions. Does not delete history.
-- DO NOT apply to production from this coding task.

alter table public.social_agent_actions
  drop constraint if exists social_agent_actions_status_check;

alter table public.social_agent_actions
  add constraint social_agent_actions_status_check
  check (status in (
    'PROPOSED',
    'APPROVED',
    'EXECUTING',
    'SUCCEEDED',
    'FAILED',
    'REJECTED',
    'SUPERSEDED'
  ));

-- Expression indexes for review grouping stored in input JSON (additive).
create index if not exists social_agent_actions_review_id_idx
  on public.social_agent_actions ((input->>'reviewId'));

create index if not exists social_agent_actions_session_status_idx
  on public.social_agent_actions (session_id, status, created_at);
