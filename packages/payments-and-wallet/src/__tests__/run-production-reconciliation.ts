import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { reconcilePaymentLink } from "@stratxcel/payments-and-wallet";

function loadEnvFile(file: string) {
  const envPath = path.resolve(process.cwd(), file);
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    for (const rawLine of content.split("\n")) {
      const line = rawLine.replace(/\r/g, "").trim();
      if (!line || line.startsWith("#")) continue;
      const eqIdx = line.indexOf("=");
      if (eqIdx !== -1) {
        const key = line.substring(0, eqIdx).trim();
        let val = line.substring(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        if (key && val) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvFile(".env.production.local");
loadEnvFile(".env.local");

console.log("SUPABASE KEYS IN ENV:", Object.keys(process.env).filter(k => k.includes("SUPABASE")));
console.log("URL val len:", process.env.NEXT_PUBLIC_SUPABASE_URL?.length, "KEY val len:", process.env.SUPABASE_SERVICE_ROLE_KEY?.length);

async function runLiveReconciliation() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error("Missing Supabase environment variables! URL:", Boolean(url), "Key:", Boolean(serviceKey));
    return;
  }

  const supabase = createClient(url, serviceKey);

  // 1. Find the payment link record for reference_id: pl_1785910159982_1f8a2bac
  const { data: link, error: linkErr } = await supabase
    .from("payment_links")
    .select("*")
    .eq("reference_id", "pl_1785910159982_1f8a2bac")
    .single();

  if (linkErr || !link) {
    console.error("Failed to find target payment link:", linkErr?.message);
    return;
  }

  console.log("Target Payment Link found:", {
    id: link.id,
    tenant_id: link.tenant_id,
    reference_id: link.reference_id,
    provider_link_id: link.provider_link_id,
    status: link.status,
    amount_cents: link.amount_cents,
  });

  // 2. Perform first reconciliation
  console.log("\n--- Executing Reconciliation Pass 1 ---");
  const result1 = await reconcilePaymentLink(supabase, {
    linkId: link.id,
    tenantId: link.tenant_id,
  });

  console.log("Reconciliation Pass 1 Result:", {
    reconciled: result1.reconciled,
    razorpayStatus: result1.razorpayStatus,
    updatedLinkStatus: result1.link.status,
  });

  // 3. Perform second reconciliation to test idempotency
  console.log("\n--- Executing Reconciliation Pass 2 (Idempotency Check) ---");
  const result2 = await reconcilePaymentLink(supabase, {
    linkId: link.id,
    tenantId: link.tenant_id,
  });

  console.log("Reconciliation Pass 2 Result:", {
    reconciled: result2.reconciled,
    razorpayStatus: result2.razorpayStatus,
    updatedLinkStatus: result2.link.status,
  });

  // 4. Verify Payment Orders count for this business reference
  const { data: orders } = await supabase
    .from("payment_orders")
    .select("*")
    .eq("tenant_id", link.tenant_id)
    .eq("provider", "razorpay")
    .eq("reference_type", "payment_link")
    .eq("reference_id", link.reference_id);

  console.log("\nPayment Orders Count:", orders?.length || 0);
  if (orders && orders.length > 0) {
    console.log("Payment Order Details:", {
      id: orders[0].id,
      state: orders[0].state,
      amount_cents: orders[0].amount_cents,
      provider_payment_id: orders[0].provider_payment_id,
    });
  }

  // 5. Verify Wallet Ledger Entries count for this order/reference
  const { data: ledgerEntries } = await supabase
    .from("wallet_ledger_entries")
    .select("*")
    .eq("tenant_id", link.tenant_id)
    .eq("reference_type", "payment_order")
    .eq("reference_id", orders?.[0]?.id || "");

  console.log("\nWallet Ledger Entries Count:", ledgerEntries?.length || 0);
  if (ledgerEntries && ledgerEntries.length > 0) {
    console.log("Ledger Entry Details:", {
      id: ledgerEntries[0].id,
      entry_type: ledgerEntries[0].entry_type,
      amount_cents: ledgerEntries[0].amount_cents,
    });
  }

  // 6. Verify final Wallet Account balance
  const { data: walletAccount } = await supabase
    .from("wallet_accounts")
    .select("*")
    .eq("tenant_id", link.tenant_id)
    .maybeSingle();

  console.log("\nFinal Wallet Account Balance (cents):", walletAccount?.balance_cents ?? 0);
  console.log("Final Wallet Account Balance (₹):", ((walletAccount?.balance_cents ?? 0) / 100).toFixed(2));
}

runLiveReconciliation();
