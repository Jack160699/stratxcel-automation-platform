import assert from "node:assert/strict";
import {
  classifyUserAgent,
  extractClientIp,
  hashTelemetryIp,
  sanitizeEventName,
  sanitizeTelemetryProperties,
  sanitizeUserAgent,
  type HeaderReader,
} from "../telemetry-shared.ts";

function headers(map: Record<string, string>): HeaderReader {
  return { get: (name: string) => map[name.toLowerCase()] ?? null };
}

async function run() {
  console.log("Starting telemetry-shared test suite...");

  // 1. hashTelemetryIp is deterministic, 16 hex chars, and never leaks the raw IP
  const hashA = hashTelemetryIp("203.0.113.4");
  const hashA2 = hashTelemetryIp("203.0.113.4");
  const hashB = hashTelemetryIp("198.51.100.9");
  assert.equal(hashA, hashA2, "Same IP must hash identically");
  assert.notEqual(hashA, hashB, "Different IPs must hash differently");
  assert.match(hashA, /^[0-9a-f]{16}$/, "Hash must be 16 lowercase hex chars");
  assert.ok(!hashA.includes("203.0.113.4"), "Hash must never contain the raw IP");

  // 2. hashTelemetryIp falls back to loopback for blank input rather than throwing
  assert.doesNotThrow(() => hashTelemetryIp(""));
  assert.equal(hashTelemetryIp(""), hashTelemetryIp("127.0.0.1"), "Blank IP must fall back to loopback");

  // 3. extractClientIp prefers the first x-forwarded-for hop, then x-real-ip, then loopback
  assert.equal(
    extractClientIp(headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" })),
    "1.2.3.4",
    "Must take the first hop of a multi-hop x-forwarded-for"
  );
  assert.equal(
    extractClientIp(headers({ "x-real-ip": "9.9.9.9" })),
    "9.9.9.9",
    "Must fall back to x-real-ip when x-forwarded-for is absent"
  );
  assert.equal(extractClientIp(headers({})), "127.0.0.1", "Must fall back to loopback when no IP header is present");

  // 4. classifyUserAgent separates scripted/crawler traffic from real browsers
  assert.equal(classifyUserAgent("curl/8.21.0"), "bot", "curl must classify as bot");
  assert.equal(
    classifyUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"),
    "bot",
    "Googlebot must classify as bot"
  );
  assert.equal(
    classifyUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
    ),
    "human",
    "A real Chrome UA must classify as human"
  );
  assert.equal(classifyUserAgent(null), "unknown", "Missing UA must classify as unknown");
  assert.equal(classifyUserAgent("   "), "unknown", "Blank UA must classify as unknown");

  // 5. sanitizeUserAgent trims and caps length, passes null through
  assert.equal(sanitizeUserAgent("  Mozilla/5.0  "), "Mozilla/5.0", "Must trim whitespace");
  assert.equal(sanitizeUserAgent("a".repeat(500))!.length, 300, "Must cap at 300 chars");
  assert.equal(sanitizeUserAgent(null), null, "Null input stays null");
  assert.equal(sanitizeUserAgent(""), null, "Blank input becomes null");

  // 6. sanitizeEventName enforces the runtime HTTP-boundary contract
  assert.equal(sanitizeEventName("onboarding_started"), "onboarding_started", "Valid snake_case passes through");
  assert.equal(sanitizeEventName("Subscription_Activated"), "subscription_activated", "Must lowercase");
  assert.equal(sanitizeEventName("  audit_report_ready  "), "audit_report_ready", "Must trim");
  assert.equal(sanitizeEventName(""), null, "Empty string is rejected");
  assert.equal(sanitizeEventName("1_starts_with_digit"), null, "Must start with a letter");
  assert.equal(sanitizeEventName("has space"), null, "Spaces are rejected");
  assert.equal(sanitizeEventName("has-dash"), null, "Dashes are rejected (snake_case only)");
  assert.equal(sanitizeEventName("a".repeat(65)), null, "Over 64 chars is rejected");
  assert.equal(sanitizeEventName(123), null, "Non-string input is rejected");
  assert.equal(sanitizeEventName(null), null, "Null input is rejected");
  assert.equal(
    sanitizeEventName("<script>alert(1)</script>"),
    null,
    "Injection-shaped input must never reach the DB as an event name"
  );

  // 7. sanitizeTelemetryProperties structures a mixed payload into a clean, flat, jsonb-safe record
  const structured = sanitizeTelemetryProperties({
    surface: "pricing",
    plan: "growth",
    attempt: 3,
    verified: true,
    nested: { should: "be dropped" },
    list: ["also", "dropped"],
    "bad key!": "dropped by key pattern",
    empty: "",
  });
  assert.deepEqual(
    structured,
    { surface: "pricing", plan: "growth", attempt: "3", verified: "true" },
    "Only allow-listed scalar keys survive, coerced to trimmed strings"
  );

  // 8. sanitizeTelemetryProperties caps key count and value length, and never throws on hostile input
  const manyKeys: Record<string, string> = {};
  for (let i = 0; i < 20; i += 1) manyKeys[`k${i}`] = "v";
  assert.equal(Object.keys(sanitizeTelemetryProperties(manyKeys)).length, 10, "Must cap at 10 keys");
  assert.equal(
    sanitizeTelemetryProperties({ long: "x".repeat(500) }).long.length,
    200,
    "Must cap each value at 200 chars"
  );
  assert.deepEqual(sanitizeTelemetryProperties(null), {}, "Null input yields an empty object, not a throw");
  assert.deepEqual(sanitizeTelemetryProperties("not an object"), {}, "Non-object input yields an empty object");
  assert.deepEqual(sanitizeTelemetryProperties(["array", "input"]), {}, "Array input yields an empty object");

  // 9. End-to-end: a realistic /api/telemetry request body sanitizes into
  // exactly what app/api/telemetry/route.ts would insert as
  // telemetry_events.event_name / .properties (a plain string and a flat
  // jsonb object respectively — the shape the router's insert() call and
  // the migration's column types both expect).
  const requestBody = {
    event: "AUDIT_REPORT_READY",
    properties: { surface: "app_audit", plan: "growth" },
  };
  const insertShape = {
    event_name: sanitizeEventName(requestBody.event),
    properties: sanitizeTelemetryProperties(requestBody.properties),
  };
  assert.deepEqual(insertShape, {
    event_name: "audit_report_ready",
    properties: { surface: "app_audit", plan: "growth" },
  });

  console.log("telemetry.test.ts: ALL PASS");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
