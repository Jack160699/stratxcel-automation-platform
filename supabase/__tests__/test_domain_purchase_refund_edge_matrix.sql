\set ON_ERROR_STOP on

DO $$
DECLARE
  d text := pg_get_functiondef('public.process_refund_atomic_v11(uuid,uuid,text,text,bigint,text,text)'::regprocedure);
  registrar_tables text[];
BEGIN
  -- Exact relationship means another link and missing/wrong metadata.link_id fail closed.
  if d !~ 'v_order.metadata->>''link_id'' <> v_link.id::text' then
    raise exception 'missing metadata.link_id / another-link relationship guard absent';
  end if;
  -- Exactly one linked domain rejects zero or multiple domains.
  if d !~ 'v_domain_count <> 1' then
    raise exception 'multiple/missing linked-domain guard absent';
  end if;
  -- Only paid_pending_registration with no provider domain evidence may reverse automatically.
  if d !~ 'v_domain.status <> ''paid_pending_registration''' or
     d !~ 'trim\(v_domain.provider_domain_id\) <> ''''' then
    raise exception 'registrar boundary guard absent';
  end if;
  -- registered, active, cancelled, refunded and failed all fail the exact status predicate above.
  if d !~ 'domain_registration_started_or_unverifiable' then
    raise exception 'non-reversible domain states do not route to manual review';
  end if;

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
