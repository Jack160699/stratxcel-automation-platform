import { createClient } from "@supabase/supabase-js";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};

const token = required("WHATSAPP_TOKEN");
const phoneNumberId = required("WHATSAPP_PHONE_NUMBER_ID");
const apiVersion = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || "v26.0";
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: binding, error: bindingError } = await supabase
  .from("whatsapp_phone_bindings")
  .select("waba_id, phone_number_id, provider_account_ref")
  .eq("phone_number_id", phoneNumberId)
  .eq("status", "active")
  .eq("outbound_enabled", true)
  .maybeSingle();

if (bindingError) throw new Error(`Unable to load platform binding: ${bindingError.message}`);
if (!binding) throw new Error("No active outbound platform binding matches WHATSAPP_PHONE_NUMBER_ID");

const graphBase = `https://graph.facebook.com/${apiVersion}`;

async function graphGet(label, path) {
  const response = await fetch(`${graphBase}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  const safe = {
    label,
    apiVersion,
    wabaId: binding.waba_id,
    httpStatus: response.status,
    errorCode: body?.error?.code ?? null,
    responseMessage: body?.error?.message ?? null,
    object:
      body?.id
        ? { id: String(body.id), name: body.name ?? body.verified_name ?? null }
        : null,
    objects: Array.isArray(body?.data)
      ? body.data.map((entry) => ({
          id: String(entry.id),
          name: entry.name ?? entry.verified_name ?? null,
        }))
      : [],
  };
  console.log(JSON.stringify(safe));
  return body;
}

console.log(
  JSON.stringify({
    label: "binding",
    apiVersion,
    wabaId: binding.waba_id,
    phoneMatchesEnvironment: binding.phone_number_id === phoneNumberId,
    object: binding.provider_account_ref
      ? { id: binding.waba_id, name: binding.provider_account_ref }
      : { id: binding.waba_id, name: null },
  }),
);

await graphGet("phone-object", `${phoneNumberId}?fields=id,verified_name,display_phone_number`);
await graphGet("stored-waba-object", `${binding.waba_id}?fields=id,name`);
await graphGet(
  "stored-waba-templates",
  `${binding.waba_id}/message_templates?fields=id,name,status,language,category&limit=200`,
);
await graphGet(
  "stored-waba-phones",
  `${binding.waba_id}/phone_numbers?fields=id,verified_name,display_phone_number&limit=100`,
);
const owned = await graphGet(
  "owned-wabas",
  `${binding.waba_id}/owned_whatsapp_business_accounts?fields=id,name&limit=100`,
);
const client = await graphGet(
  "client-wabas",
  `${binding.waba_id}/client_whatsapp_business_accounts?fields=id,name&limit=100`,
);
const candidates = [...(owned?.data ?? []), ...(client?.data ?? [])];
for (const candidate of candidates) {
  await graphGet(
    "candidate-waba-phones",
    `${candidate.id}/phone_numbers?fields=id,verified_name,display_phone_number&limit=100`,
  );
  await graphGet(
    "candidate-waba-templates",
    `${candidate.id}/message_templates?fields=id,name,status,language,category&limit=200`,
  );
}

