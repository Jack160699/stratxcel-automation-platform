-- Additive closed-beta invariant: an Audit cannot transition to completed
-- until a customer-deliverable report is persisted on the same order.
-- Existing completed rows are not rewritten; the guard applies to future
-- status transitions only.

create or replace function public.enforce_audit_report_before_completion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    if new.report_data is null
      or jsonb_typeof(new.report_data) <> 'object'
      or length(trim(coalesce(new.report_data->>'executiveSummary', ''))) = 0
      or jsonb_typeof(new.report_data->'priorityRisks') <> 'array'
      or jsonb_array_length(new.report_data->'priorityRisks') = 0
      or jsonb_typeof(new.report_data->'actionPlan') <> 'array'
      or jsonb_array_length(new.report_data->'actionPlan') = 0 then
      raise exception 'audit_report_required_before_completion' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists audit_report_before_completion on public.audit_orders;
create trigger audit_report_before_completion
before update of status on public.audit_orders
for each row execute function public.enforce_audit_report_before_completion();
