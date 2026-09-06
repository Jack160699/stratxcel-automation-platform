// Real, authenticated end-to-end validation of the remote local AI server
// connection (LOCAL_AI_API_URL / LOCAL_AI_API_KEY, expected to be injected by
// `vercel env pull` / `vercel env run`, same convention as
// scripts/lib/verify-openai-key.mjs). Never prints the key -- only length and
// pass/fail status. Runs every check independently (one failure does not
// abort the rest) so a single bad endpoint doesn't hide everything else that
// IS working. Prints one JSON report to stdout and exits non-zero if any
// required check failed.
//
// Endpoint/response shapes below are NOT a generic convention (this is not
// an OpenAI-compatible server) — confirmed live against ai.stratxcel.in on
// 2026-09-05. See packages/ai-runtime/src/providers/local-ai.ts's header
// comment for the authoritative contract notes.
//
// Usage: node scripts/lib/verify-local-ai-connection.mjs
// (LOCAL_AI_API_URL and LOCAL_AI_API_KEY must be present in the environment.)

const apiUrl = process.env.LOCAL_AI_API_URL?.replace(/\/+$/, "");
const apiKey = process.env.LOCAL_AI_API_KEY;

const report = {
  configured: Boolean(apiUrl && apiKey),
  apiUrlHost: null,
  apiKeyLength: apiKey ? apiKey.length : 0,
  checks: {},
};

if (apiUrl) {
  try {
    report.apiUrlHost = new URL(apiUrl).host;
  } catch {
    report.apiUrlHost = "INVALID_URL";
  }
}

if (!report.configured) {
  console.log(JSON.stringify({ ...report, status: "not_configured" }, null, 2));
  process.exit(1);
}

const authHeaders = { Authorization: `Bearer ${apiKey}` };

function redact(text) {
  if (!apiKey) return text;
  return text.split(apiKey).join("[REDACTED]");
}

async function timeIt(fn) {
  const startedAt = Date.now();
  try {
    const result = await fn();
    return { ...result, latencyMs: Date.now() - startedAt };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - startedAt };
  }
}

async function checkHealth() {
  return timeIt(async () => {
    const res = await fetch(`${apiUrl}/v1/health`, { headers: authHeaders });
    const body = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, bodyPreview: redact(body).slice(0, 300) };
  });
}

async function checkReady() {
  return timeIt(async () => {
    const res = await fetch(`${apiUrl}/v1/ready`, { headers: authHeaders });
    const body = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, bodyPreview: redact(body).slice(0, 300) };
  });
}

async function checkModels() {
  return timeIt(async () => {
    const res = await fetch(`${apiUrl}/v1/models`, { headers: authHeaders });
    const body = await res.text().catch(() => "");
    let modelNames = [];
    try {
      const json = JSON.parse(body);
      modelNames = (json.models ?? []).map((m) => m.name).filter(Boolean);
    } catch {
      // non-JSON body — leave modelNames empty, bodyPreview still reported below
    }
    return { ok: res.ok && modelNames.length > 0, status: res.status, modelCount: modelNames.length, modelNames, bodyPreview: redact(body).slice(0, 400) };
  });
}

async function checkChat() {
  return timeIt(async () => {
    const res = await fetch(`${apiUrl}/v1/chat`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "user", content: "Respond with exactly five words confirming the remote StratXcel AI server is working." },
        ],
      }),
    });
    const body = await res.text().catch(() => "");
    let text = null;
    let model = null;
    let fallback = null;
    try {
      const json = JSON.parse(body);
      text = json.content ?? null;
      model = json.model ?? null;
      fallback = json.fallback ?? null;
    } catch {
      // leave fields null — raw bodyPreview below still shows the real response
    }
    return { ok: res.ok && Boolean(text), status: res.status, model, fallback, text, bodyPreview: redact(body).slice(0, 400) };
  });
}

async function checkCoding() {
  return timeIt(async () => {
    const res = await fetch(`${apiUrl}/v1/code`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt:
          "Write a small, safe React functional component named Greeting that renders \"Hello from StratXcel\" in an <h1>. Return only the code.",
      }),
    });
    const body = await res.text().catch(() => "");
    let text = null;
    let model = null;
    try {
      const json = JSON.parse(body);
      text = json.generated_code ?? null;
      model = json.model ?? null;
    } catch {
      // leave text/model null
    }
    return { ok: res.ok && Boolean(text), status: res.status, model, containsComponent: Boolean(text?.includes("Greeting")), bodyPreview: redact(body).slice(0, 400) };
  });
}

async function checkImage() {
  return timeIt(async () => {
    const res = await fetch(`${apiUrl}/v1/images/generate`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "A clean, modern flat-style logo icon for a small business analytics dashboard, minimal, professional",
        quality: "fast",
      }),
    });
    const body = await res.text().catch(() => "");
    let hasUrl = false;
    let modelTier = null;
    let qualityScore = null;
    try {
      const json = JSON.parse(body);
      hasUrl = Boolean(json.url);
      modelTier = json.model_tier ?? null;
      qualityScore = json.quality_score ?? null;
    } catch {
      // leave hasUrl false
    }
    // Don't dump image bytes into the report — presence of a fetchable url is the proof.
    return { ok: res.ok && hasUrl, status: res.status, modelTier, qualityScore, bodyLength: body.length };
  });
}

async function checkRag() {
  return timeIt(async () => {
    const res = await fetch(`${apiUrl}/v1/rag/query`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "What does this business sell?",
        tenant_id: "verify-script-probe-tenant",
        business_id: "verify-script-probe-business",
      }),
    });
    const body = await res.text().catch(() => "");
    let resultCount = null;
    try {
      const json = JSON.parse(body);
      resultCount = Array.isArray(json.results) ? json.results.length : null;
    } catch {
      // leave resultCount null
    }
    // Reachable + authenticated + correctly tenant-scoped is what this proves.
    // It does NOT prove grounding — no ingestion endpoint has been found yet,
    // so a synthetic probe tenant legitimately has zero indexed results.
    return { ok: res.ok, status: res.status, resultCount, bodyPreview: redact(body).slice(0, 300) };
  });
}

report.checks.health = await checkHealth();
report.checks.ready = await checkReady();
report.checks.models = await checkModels();
report.checks.chat = await checkChat();
report.checks.coding = await checkCoding();
report.checks.image = await checkImage();
report.checks.rag = await checkRag();

const requiredForConnected = ["health", "ready", "models", "chat"];
const allRequiredOk = requiredForConnected.every((k) => report.checks[k]?.ok);
report.status = allRequiredOk ? "connected" : "failed";

console.log(JSON.stringify(report, null, 2));
process.exit(allRequiredOk ? 0 : 1);
