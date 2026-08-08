revoke execute on function public.issue_invoice_for_payment_order(uuid) from public, anon, authenticated;
revoke execute on function public.issue_credit_note_for_refund(uuid) from public, anon, authenticated;
revoke execute on function public.set_subscription_cancellation(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.schedule_subscription_plan_change(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.run_subscription_lifecycle_cycle() from public, anon, authenticated;

grant execute on function public.issue_invoice_for_payment_order(uuid) to service_role;
grant execute on function public.issue_credit_note_for_refund(uuid) to service_role;
grant execute on function public.set_subscription_cancellation(uuid, uuid, boolean) to service_role;
grant execute on function public.schedule_subscription_plan_change(uuid, uuid, text) to service_role;
grant execute on function public.run_subscription_lifecycle_cycle() to service_role;
