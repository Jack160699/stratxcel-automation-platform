-- Root-cause fix: service_role had zero SELECT/INSERT/UPDATE/DELETE grants
-- on ANY table in this project (confirmed via information_schema.role_table_grants
-- — even pre-existing tables like social_accounts/content_master only had
-- TRIGGER/TRUNCATE/REFERENCES for service_role). service_role bypasses RLS
-- by design but does NOT bypass table-level GRANTs — those are separate
-- Postgres mechanisms, and this project never had them configured for
-- service_role at all. authenticated had proper grants on the original
-- July-25 tables but not on any table added by this app's migrations.
--
-- This explains the pre-existing "Invalid API key"-adjacent OAuth failures
-- better than a key mismatch would: PostgREST returns a permission-denied
-- error (42501) that reads similarly opaque to callers expecting a clean
-- 2xx/4xx from the API layer.
grant select, insert, update, delete on all tables in schema public to service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Also cover sequences (identity columns, if any use them) so INSERT never
-- silently fails on a nextval() permission error.
grant usage, select on all sequences in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated;

-- Make this automatic for every future table so this class of bug can't
-- recur on the next migration.
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to service_role;
alter default privileges in schema public grant usage, select on sequences to authenticated;
