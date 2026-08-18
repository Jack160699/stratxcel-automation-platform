-- Second follow-up to 20260818230000_social_copilot_tenant_scoping.sql:
-- social_metrics was missed too. Same join-based technique via
-- content_variants -> content_master.tenant_id.

create policy metrics_tenant_member on social_metrics for select to authenticated
  using (
    exists (
      select 1 from content_variants v
      join content_master m on m.id = v.master_id
      join tenant_members tm on tm.tenant_id = m.tenant_id
      where v.id = social_metrics.variant_id and tm.user_id = (select auth.uid())
    )
  );

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception
  when others then
    null;
end $$;
