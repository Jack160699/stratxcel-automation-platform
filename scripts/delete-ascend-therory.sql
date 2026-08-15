-- ONE REAL CUSTOMER DELETE: Ascend Therory
-- Execute delete_customer_tenant_v1 directly on the production database
-- This is the SECURITY DEFINER function executed as service_role

SELECT public.delete_customer_tenant_v1(
  '0d16111f-fd42-4bd8-bcde-34af2dff6cee'::uuid,
  'admin@stratxcel.in'
) AS result;
