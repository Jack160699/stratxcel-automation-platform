-- Widens agent_memories' source_channel CHECK constraint to allow 'hermes'
-- -- a Hermes mission is a real, distinct, verified writer (tenant comes
-- from the mission token, not a live human session the way
-- admin_web/client_web/whatsapp all are), and deserves its own honest
-- label rather than being mislabeled as one of the existing three human
-- channels. No existing row is affected; this only widens what a future
-- insert may use.

alter table public.agent_memories drop constraint agent_memories_source_channel_check;
alter table public.agent_memories add constraint agent_memories_source_channel_check
  check (source_channel = any (array['admin_web'::text, 'client_web'::text, 'whatsapp'::text, 'hermes'::text]));
