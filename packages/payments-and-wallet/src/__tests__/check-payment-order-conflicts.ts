import { createClient } from "@supabase/supabase-js";

async function checkPaymentOrderConflicts() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.log("No remote credentials in environment for direct DB query script.");
    return;
  }

  const supabase = createClient(url, serviceKey);
  const { data, error } = await supabase
    .from("payment_orders")
    .select("tenant_id, provider, reference_type, reference_id")
    .not("reference_type", "is", null)
    .not("reference_id", "is", null);

  if (error) {
    console.error("Error querying payment_orders:", error.message);
    return;
  }

  const counts = new Map<string, number>();
  let duplicates = 0;

  for (const row of data || []) {
    const key = `${row.tenant_id}:${row.provider}:${row.reference_type}:${row.reference_id}`;
    const current = (counts.get(key) || 0) + 1;
    counts.set(key, current);
    if (current > 1) duplicates++;
  }

  console.log(`Scanned ${data?.length || 0} non-null reference rows in payment_orders.`);
  console.log(`Duplicate business reference count: ${duplicates}`);
}

checkPaymentOrderConflicts();
