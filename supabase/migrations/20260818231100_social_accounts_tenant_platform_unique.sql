-- No DB-level uniqueness ever enforced (tenant_id, platform) for tenant-
-- scoped rows -- only (owner_id, platform, provider_account_id), a legacy
-- constraint from the admin/owner-scoped era. Tenant-scoped connect/
-- reconnect logic (app/api/social/oauth/[provider]/callback/route.ts's
-- upsertConnectedAccount) already checks-then-updates the existing tenant
-- row in application code, but nothing in the database itself prevented a
-- race (two concurrent connect attempts) from creating two active rows for
-- the same tenant+platform. Verified zero existing duplicates before
-- adding this. Partial index (tenant_id IS NOT NULL) leaves the legacy
-- owner-scoped rows, which have no tenant_id, untouched.

create unique index if not exists social_accounts_tenant_platform_unique
  on social_accounts (tenant_id, platform)
  where tenant_id is not null;
