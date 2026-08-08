-- Migration: add 'migrated_verified_bot' as a distinct phone-binding source.
--
-- Context: 20260808250000 introduced source='legacy_verified_bot' for the
-- shadow/parity bridge, and lib/whatsapp/send-outbound.ts unconditionally
-- blocks any real send for that exact source value — intentional, since
-- that binding was shadow-observation-only and must never send for real.
--
-- A genuine, owner-approved cutover (the existing verified WhatsApp number
-- moving from the old bot backend to being actually served by Stratxcel)
-- is a different state: sends through it SHOULD be allowed, gated by the
-- normal checks every other binding already goes through (kill switch,
-- consent, template approval, automation mode, idempotency) — never by
-- the shadow-only unconditional block. Without this distinct value, a
-- completed cutover would be permanently unable to send, which is exactly
-- backwards. No existing row is touched by this migration; it only widens
-- what values source may take on future rows/updates.
--
-- The exact auto-generated name of the existing check constraint on each
-- `source` column isn't assumed — Docker is unavailable in this
-- environment to dump and confirm it, so this finds and drops whatever
-- check constraint actually exists on that column by querying pg_catalog
-- directly, rather than guessing a name.
do $$
declare
  con record;
begin
  for con in
    select distinct pc.conname, rel.relname as table_name
    from pg_constraint pc
    join pg_class rel on rel.oid = pc.conrelid
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(pc.conkey)
    where rel.relname in ('whatsapp_phone_bindings', 'whatsapp_messages')
      and pc.contype = 'c'
      and att.attname = 'source'
  loop
    execute format('alter table %I drop constraint %I', con.table_name, con.conname);
  end loop;
end $$;

alter table whatsapp_phone_bindings
  add constraint whatsapp_phone_bindings_source_check
  check (source in ('native', 'legacy_verified_bot', 'migrated_verified_bot'));

alter table whatsapp_messages
  add constraint whatsapp_messages_source_check
  check (source in ('native', 'legacy_verified_bot', 'migrated_verified_bot'));

-- At most one migrated-bot binding, same reasoning as the existing
-- single-legacy-binding guard: there is exactly one verified number being
-- migrated.
create unique index if not exists whatsapp_phone_bindings_single_migrated_idx
  on whatsapp_phone_bindings (source)
  where source = 'migrated_verified_bot' and status <> 'revoked';
