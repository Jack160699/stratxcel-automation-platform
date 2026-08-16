-- Growth OS Core Architecture Migration
-- Normalized tables for Business Evidence, Requirements, Modular Service Catalog, Plan Versions, and Value Ledger.

CREATE TABLE IF NOT EXISTS public.business_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  fact_key text NOT NULL,
  fact_value jsonb NOT NULL,
  source_type text NOT NULL,
  source_ref text,
  evidence_snippet text NOT NULL,
  confidence text NOT NULL CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_fact_source UNIQUE (tenant_id, fact_key, source_type)
);

CREATE INDEX IF NOT EXISTS idx_business_evidence_tenant ON public.business_evidence(tenant_id);
CREATE INDEX IF NOT EXISTS idx_business_evidence_key ON public.business_evidence(fact_key);

CREATE TABLE IF NOT EXISTS public.business_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requirement_key text NOT NULL,
  title text NOT NULL,
  priority text NOT NULL CHECK (priority IN ('REQUIRED', 'HIGH', 'MEDIUM', 'LOW', 'NOT_CURRENTLY_REQUIRED')),
  reason text NOT NULL,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  business_impact text NOT NULL,
  confidence text NOT NULL CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
  recommended_service_key text NOT NULL,
  expected_frequency text NOT NULL,
  expected_quantity int NOT NULL DEFAULT 1,
  dependencies text[] NOT NULL DEFAULT '{}'::text[],
  cycle_month text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_requirements_tenant_cycle ON public.business_requirements(tenant_id, cycle_month);

CREATE TABLE IF NOT EXISTS public.service_catalog_v2 (
  service_key text PRIMARY KEY,
  label text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  unit text NOT NULL,
  standard_quality_spec jsonb NOT NULL,
  premium_quality_spec jsonb NOT NULL,
  base_internal_cost_paise int NOT NULL,
  market_mrp_paise int NOT NULL,
  required_tools text[] NOT NULL DEFAULT '{}'::text[],
  ai_model_tier text NOT NULL DEFAULT 'standard',
  estimated_execution_time_minutes int NOT NULL DEFAULT 15,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version int NOT NULL,
  tier text NOT NULL CHECK (tier IN ('STANDARD', 'PREMIUM')),
  status text NOT NULL CHECK (status IN ('PROPOSED', 'ACTIVE', 'SUPERSEDED', 'CANCELLED')),
  cycle_month text NOT NULL,
  total_mrp_cents int NOT NULL,
  expected_cost_cents int NOT NULL,
  projected_margin_cents int NOT NULL,
  reason_for_change text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  entitlement_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_plan_versions_tenant_cycle ON public.plan_versions(tenant_id, cycle_month);

CREATE TABLE IF NOT EXISTS public.value_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cycle_month text NOT NULL,
  plan_id uuid REFERENCES public.plan_versions(id) ON DELETE SET NULL,
  service_key text NOT NULL,
  mission_id uuid REFERENCES public.missions(id) ON DELETE SET NULL,
  deliverable_title text NOT NULL,
  deliverable_summary text NOT NULL,
  artifact_ref text,
  result_metric text,
  result_value text,
  customer_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_value_ledger_tenant_cycle ON public.value_ledger(tenant_id, cycle_month);

-- Enable RLS
ALTER TABLE public.business_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_catalog_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.value_ledger ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access on business_evidence"
  ON public.business_evidence FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on business_requirements"
  ON public.business_requirements FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on service_catalog_v2"
  ON public.service_catalog_v2 FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on plan_versions"
  ON public.plan_versions FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on value_ledger"
  ON public.value_ledger FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- Authenticated tenant access
CREATE POLICY "Tenant members can read business_evidence"
  ON public.business_evidence FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

CREATE POLICY "Tenant members can read business_requirements"
  ON public.business_requirements FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

CREATE POLICY "Authenticated users can read active service_catalog_v2"
  ON public.service_catalog_v2 FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Tenant members can read plan_versions"
  ON public.plan_versions FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

CREATE POLICY "Tenant members can read value_ledger"
  ON public.value_ledger FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()) AND customer_visible = true);

REVOKE ALL ON public.business_evidence, public.business_requirements, public.service_catalog_v2, public.plan_versions, public.value_ledger FROM public, anon;
GRANT SELECT ON public.business_evidence, public.business_requirements, public.service_catalog_v2, public.plan_versions, public.value_ledger TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_evidence, public.business_requirements, public.service_catalog_v2, public.plan_versions, public.value_ledger TO service_role;

