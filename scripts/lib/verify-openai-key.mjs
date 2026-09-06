// Minimal, non-destructive authenticated check that process.env.OPENAI_API_KEY
// (expected to be injected by `vercel env run`) actually authenticates
// against OpenAI. Never prints the key -- only length and pass/fail status.
const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.log(JSON.stringify({ status: "not_set" }));
  process.exit(1);
}
const res = await fetch("https://api.openai.com/v1/models", {
  headers: { Authorization: `Bearer ${key}` },
});
const body = await res.text();
const redacted = body.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "[REDACTED]");
console.log(JSON.stringify({ status: res.status, ok: res.ok, keyLength: key.length, bodyPreview: redacted.slice(0, 300) }));
process.exit(res.ok ? 0 : 1);
