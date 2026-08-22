-- Fixes a production bug: getWalletAccount() lazily INSERTs a zero-balance
-- wallet_accounts row on first read for a tenant, but `authenticated` only
-- ever held SELECT on this table (see wallet_accounts_tenant_read), so every
-- first-ever wallet read failed with "permission denied for table
-- wallet_accounts" (app/api/platform/wallet/route.ts, GET /api/platform/wallet).
--
-- This grants tenant members INSERT, scoped to their own tenant_id and
-- restricted to the zero-balance row the lazy-create path actually writes —
-- any other write (crediting/debiting the wallet) still requires the
-- service-role ledger RPCs in packages/payments-and-wallet, which this
-- policy does not touch.

grant insert on wallet_accounts to authenticated;

create policy wallet_accounts_tenant_insert
  on wallet_accounts for insert to authenticated
  with check (
    balance_cents = 0
    and exists (
      select 1 from tenant_members m
      where m.tenant_id = wallet_accounts.tenant_id
        and m.user_id = (select auth.uid())
    )
  );

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception
  when others then
    null;
end $$;
