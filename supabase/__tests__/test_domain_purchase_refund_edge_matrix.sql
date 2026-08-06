\set ON_ERROR_STOP on

DO $$
DECLARE
  registrar_tables text[];
BEGIN
  select array_agg(format('%I.%I',table_schema,table_name) order by table_schema,table_name)
  into registrar_tables
  from information_schema.tables
  where table_schema not in ('pg_catalog','information_schema')
    and table_name ~ '(registrar|domain).*(request|job|transaction)|(request|job|transaction).*(registrar|domain)';

  if registrar_tables is null then
    raise notice 'No registrar request/job/transaction evidence table exists; automatic reversal remains limited to paid_pending_registration and blank provider_domain_id.';
  else
    raise notice 'Registrar evidence tables discovered and require explicit review: %', registrar_tables;
  end if;
END;
$$;

BEGIN;
DO $$
DECLARE
  v_tenant uuid;
  v_link uuid;
  v_link_other uuid;
  v_order uuid;
  v_refund uuid;
  v_unrelated uuid;
  v_res jsonb;
  v_status text;
  v_reason text;
  v_processed_at timestamptz;
  v_ref_id text;
  v_case text;
  v_domain_status text;
BEGIN
  insert into tenants(name, slug)
  values ('Domain Refund Edge Tenant', 'domain-refund-edge-' || gen_random_uuid()::text)
  returning id into v_tenant;

  insert into payment_links(tenant_id, reference_id, amount_cents, payment_purpose, status)
  values (v_tenant, 'plink_unrelated_' || gen_random_uuid()::text, 149900, 'domain_purchase', 'paid')
  returning id into v_link_other;
  insert into domains(tenant_id, domain_name, provider, status, purchase_price_cents, renewal_price_cents, payment_link_id, registrant_name, registrant_email, registrant_phone)
  values (v_tenant, 'unrelated-' || gen_random_uuid()::text || '.in', 'sandbox', 'paid_pending_registration', 149900, 149900, v_link_other, 'Unrelated', 'unrelated@example.invalid', '+919999999999')
  returning id into v_unrelated;

  -- zero domains -> domain_not_found_for_refund
  insert into payment_links(tenant_id, reference_id, amount_cents, payment_purpose, status)
  values (v_tenant, 'plink_zero_' || gen_random_uuid()::text, 149900, 'domain_purchase', 'paid')
  returning id into v_link;
  select reference_id into v_ref_id from payment_links where id = v_link;
  insert into payment_orders(tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id, metadata)
  values (v_tenant, 'razorpay', 'pay_zero', 'order_zero', 149900, 'INR', 'CAPTURED', 'domain_purchase', 'live', 'payment_link', v_ref_id, jsonb_build_object('link_id', v_link::text))
  returning id into v_order;
  insert into payment_refunds(tenant_id, payment_order_id, amount_cents, status)
  values (v_tenant, v_order, 149900, 'PENDING')
  returning id into v_refund;
  v_res := process_refund_atomic_v11(v_refund, v_order, 'rfnd_zero', 'pay_zero', 149900, 'processed');
  select status, reason, processed_at into v_status, v_reason, v_processed_at from payment_refunds where id = v_refund;
  if v_res->>'reason' <> 'domain_not_found_for_refund' or v_status <> 'MANUAL_REVIEW' or v_reason <> 'domain_not_found_for_refund' or v_processed_at is not null then
    raise exception 'zero-domain refund guard failed: res=% status=% reason=% processed_at=%', v_res, v_status, v_reason, v_processed_at;
  end if;

  -- two domains -> multiple_domains_linked_to_purchase
  insert into payment_links(tenant_id, reference_id, amount_cents, payment_purpose, status)
  values (v_tenant, 'plink_two_' || gen_random_uuid()::text, 149900, 'domain_purchase', 'paid')
  returning id into v_link;
  insert into domains(tenant_id, domain_name, provider, status, purchase_price_cents, renewal_price_cents, payment_link_id, registrant_name, registrant_email, registrant_phone)
  values
    (v_tenant, 'multi-a-' || gen_random_uuid()::text || '.in', 'sandbox', 'paid_pending_registration', 149900, 149900, v_link, 'Multi A', 'a@example.invalid', '+919999999991'),
    (v_tenant, 'multi-b-' || gen_random_uuid()::text || '.in', 'sandbox', 'paid_pending_registration', 149900, 149900, v_link, 'Multi B', 'b@example.invalid', '+919999999992');
  select reference_id into v_ref_id from payment_links where id = v_link;
  insert into payment_orders(tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id, metadata)
  values (v_tenant, 'razorpay', 'pay_two', 'order_two', 149900, 'INR', 'CAPTURED', 'domain_purchase', 'live', 'payment_link', v_ref_id, jsonb_build_object('link_id', v_link::text))
  returning id into v_order;
  insert into payment_refunds(tenant_id, payment_order_id, amount_cents, status)
  values (v_tenant, v_order, 149900, 'PENDING')
  returning id into v_refund;
  v_res := process_refund_atomic_v11(v_refund, v_order, 'rfnd_two', 'pay_two', 149900, 'processed');
  select status, reason, processed_at into v_status, v_reason, v_processed_at from payment_refunds where id = v_refund;
  if v_res->>'reason' <> 'multiple_domains_linked_to_purchase' or v_status <> 'MANUAL_REVIEW' or v_reason <> 'multiple_domains_linked_to_purchase' or v_processed_at is not null then
    raise exception 'multi-domain refund guard failed: res=% status=% reason=% processed_at=%', v_res, v_status, v_reason, v_processed_at;
  end if;

  foreach v_case in array array['missing_metadata', 'wrong_metadata'] loop
    insert into payment_links(tenant_id, reference_id, amount_cents, payment_purpose, status)
    values (v_tenant, 'plink_' || v_case || '_' || gen_random_uuid()::text, 149900, 'domain_purchase', 'paid')
    returning id into v_link;
    insert into domains(tenant_id, domain_name, provider, status, purchase_price_cents, renewal_price_cents, payment_link_id, registrant_name, registrant_email, registrant_phone)
    values (v_tenant, v_case || '-' || gen_random_uuid()::text || '.in', 'sandbox', 'paid_pending_registration', 149900, 149900, v_link, 'Owner', 'owner@example.invalid', '+919999999993');
    select reference_id into v_ref_id from payment_links where id = v_link;
    insert into payment_orders(tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id, metadata)
    values (
      v_tenant, 'razorpay', 'pay_' || v_case, 'order_' || v_case, 149900, 'INR', 'CAPTURED',
      'domain_purchase', 'live', 'payment_link', v_ref_id,
      case when v_case = 'missing_metadata' then '{}'::jsonb else jsonb_build_object('link_id', gen_random_uuid()::text) end
    )
    returning id into v_order;
    insert into payment_refunds(tenant_id, payment_order_id, amount_cents, status)
    values (v_tenant, v_order, 149900, 'PENDING')
    returning id into v_refund;
    v_res := process_refund_atomic_v11(v_refund, v_order, 'rfnd_' || v_case, 'pay_' || v_case, 149900, 'processed');
    select status, reason, processed_at into v_status, v_reason, v_processed_at from payment_refunds where id = v_refund;
    if v_res->>'reason' <> 'domain_purchase_refund_relationship_mismatch' or v_status <> 'MANUAL_REVIEW' or v_reason <> 'domain_purchase_refund_relationship_mismatch' or v_processed_at is not null then
      raise exception 'metadata relationship guard failed for %: res=% status=% reason=% processed_at=%', v_case, v_res, v_status, v_reason, v_processed_at;
    end if;
  end loop;

  foreach v_case in array array['registered', 'active', 'cancelled', 'refunded', 'failed'] loop
    insert into payment_links(tenant_id, reference_id, amount_cents, payment_purpose, status)
    values (v_tenant, 'plink_' || v_case || '_' || gen_random_uuid()::text, 149900, 'domain_purchase', 'paid')
    returning id into v_link;
    insert into domains(tenant_id, domain_name, provider, status, purchase_price_cents, renewal_price_cents, payment_link_id, registrant_name, registrant_email, registrant_phone)
    values (v_tenant, v_case || '-' || gen_random_uuid()::text || '.in', 'sandbox', v_case, 149900, 149900, v_link, 'Owner', 'owner@example.invalid', '+919999999994');
    select reference_id into v_ref_id from payment_links where id = v_link;
    insert into payment_orders(tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id, metadata)
    values (v_tenant, 'razorpay', 'pay_' || v_case, 'order_' || v_case, 149900, 'INR', 'CAPTURED', 'domain_purchase', 'live', 'payment_link', v_ref_id, jsonb_build_object('link_id', v_link::text))
    returning id into v_order;
    insert into payment_refunds(tenant_id, payment_order_id, amount_cents, status)
    values (v_tenant, v_order, 149900, 'PENDING')
    returning id into v_refund;
    v_res := process_refund_atomic_v11(v_refund, v_order, 'rfnd_' || v_case, 'pay_' || v_case, 149900, 'processed');
    select status, reason, processed_at into v_status, v_reason, v_processed_at from payment_refunds where id = v_refund;
    select status into v_domain_status from domains where payment_link_id = v_link;
    if v_res->>'status' <> 'MANUAL_REVIEW' or v_status <> 'MANUAL_REVIEW' or v_processed_at is not null or v_domain_status <> v_case then
      raise exception 'non-reversible domain status guard failed for %: res=% status=% domain_status=% processed_at=%', v_case, v_res, v_status, v_domain_status, v_processed_at;
    end if;
  end loop;

  select status into v_domain_status from domains where id = v_unrelated;
  if v_domain_status <> 'paid_pending_registration' then
    raise exception 'unrelated same-tenant domain mutated to %', v_domain_status;
  end if;
END;
$$;
ROLLBACK;
