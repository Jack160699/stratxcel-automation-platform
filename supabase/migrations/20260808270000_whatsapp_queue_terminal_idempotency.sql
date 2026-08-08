-- Permanent, DB-level dedup for WhatsApp inbound webhook deliveries.
--
-- queue_jobs_tenant_idempotency_active_idx (see 20260803130000_queue.sql)
-- only protects ACTIVE (non-terminal) jobs by design: for most job types,
-- the same idempotency key legitimately represents a new, later occurrence
-- of the same logical event once the prior job has finished, so terminal
-- jobs intentionally free the key up for reuse. That default is wrong for
-- whatsapp.process_inbound specifically: a Meta WhatsApp provider message
-- ID is a permanent, one-time identifier for a single inbound message.
-- Meta's webhook delivery is at-least-once, so a redelivery of the SAME
-- provider message ID must always resolve back to the SAME queue job --
-- even long after that job reached SUCCEEDED -- never a second row and
-- never a second processing of the same message.
--
-- This index is intentionally scoped to job_type = 'whatsapp.process_inbound'
-- only. It does not touch, replace, or weaken
-- queue_jobs_tenant_idempotency_active_idx, which continues to govern
-- every other job type's active-only dedup exactly as before.
--
-- Safety note for whoever applies this migration: if any historical
-- whatsapp.process_inbound rows already share a (tenant_id, idempotency_key)
-- pair, this CREATE UNIQUE INDEX will fail rather than silently drop data.
-- Run the following check first and resolve any hits manually (do not
-- blind-delete) before applying:
--
--   select tenant_id, idempotency_key, count(*)
--   from queue_jobs
--   where job_type = 'whatsapp.process_inbound'
--     and idempotency_key is not null
--   group by tenant_id, idempotency_key
--   having count(*) > 1;
create unique index if not exists queue_jobs_whatsapp_provider_idempotency_idx
  on queue_jobs (tenant_id, job_type, idempotency_key)
  where job_type = 'whatsapp.process_inbound'
    and idempotency_key is not null;
