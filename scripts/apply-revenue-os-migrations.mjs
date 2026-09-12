import { readFileSync } from "fs";

const projectRef = "uccqlgeghkwzujeeymua";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const migrations = [
  "supabase/migrations/20260909220000_company_offer_catalog.sql",
  "supabase/migrations/20260909230000_revenue_missions.sql",
  "supabase/migrations/20260909240000_crm_lead_lifecycle.sql",
  "supabase/migrations/20260909250000_revenue_events.sql",
  "supabase/migrations/20260909260000_spreadsheet_operations.sql",
];

for (const m of migrations) {
  const sql = readFileSync(m, "utf8");
  let resp, body;
  try {
    resp = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ query: sql }),
      }
    );
    body = await resp.text();
  } catch (e) {
    console.log("NETWORK_ERROR", m, e.message);
    continue;
  }
  const name = m.split("/").pop();
  if (resp.ok) {
    console.log("OK  ", name);
  } else {
    // 401 means token not accepted as management token
    console.log("FAIL", resp.status, name, body.substring(0, 200));
  }
}
