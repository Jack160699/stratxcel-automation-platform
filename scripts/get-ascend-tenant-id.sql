-- ONE REAL CUSTOMER DELETE: Ascend Therory
-- This calls the canonical SECURITY DEFINER function directly as service_role

-- First, get the tenant ID for ascend-therory
SELECT id, slug, name FROM public.tenants WHERE slug = 'ascend-therory';
