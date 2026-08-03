-- Corrective migration: 20260727214817_grant_role_privileges.sql previously
-- ran `alter default privileges in schema public grant ... to authenticated`
-- for both tables and sequences. ALTER DEFAULT PRIVILEGES is a sticky ACL
-- entry keyed to the granting role (postgres, the migration runner) — it is
-- not undone by deleting the statement from the migration file, because that
-- only stops a *future* run of that file from re-creating the entry. Any
-- database the old migration already ran against keeps the standing default
-- ACL that hands every future public table full CRUD to `authenticated` the
-- moment it's created, regardless of that table's own RLS policies.
--
-- This migration explicitly revokes those default-privilege ACL entries for
-- role postgres so that CREATE TABLE / CREATE SEQUENCE in schema public no
-- longer auto-grants anything to authenticated or anon. It must run before
-- 20260803120000_platform_tenants_rbac_audit.sql (and every migration after
-- it) so the platform tables created from that point on rely solely on their
-- own explicit, table-specific grants and RLS policies — never an inherited
-- default.
--
-- Future-object defaults only: this does NOT revoke privileges already
-- granted on existing tables/sequences (those grants, e.g. the
-- table-specific `grant select on tenants ... to authenticated` statements
-- in later migrations, are untouched and still required). It also does not
-- touch service_role's default privileges or anything owned by
-- Supabase-managed roles (supabase_admin, etc.) — service_role must keep
-- getting full CRUD on every future table by default so the app's own
-- server-side clients keep working.

alter default privileges for role postgres in schema public
  revoke all privileges on tables from authenticated;

alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon;

alter default privileges for role postgres in schema public
  revoke all privileges on sequences from authenticated;

alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon;
