import { createClient } from "@supabase/supabase-js";

async function checkDuplicates() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.log("No remote credentials in environment, proceeding to schema check.");
    return;
  }

  const supabase = createClient(url, serviceKey);
  const { data, error } = await supabase
    .from("payment_refunds")
    .select("provider_refund_id")
    .not("provider_refund_id", "is", null);

  if (error) {
    console.error("Error querying payment_refunds:", error.message);
    return;
  }

  const ids = (data || []).map((r) => r.provider_refund_id);
  const counts = new Map<string, number>();
  let duplicates = 0;

  for (const id of ids) {
    if (!id) continue;
    const current = (counts.get(id) || 0) + 1;
    counts.set(id, current);
    if (current > 1) duplicates++;
  }

  console.log(`Scanned ${ids.length} non-null provider_refund_id rows in payment_refunds.`);
  console.log(`Duplicate provider_refund_id count: ${duplicates}`);
}

checkDuplicates();
