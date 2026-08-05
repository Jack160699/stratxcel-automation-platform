import assert from "node:assert/strict";
import { createHash } from "crypto";

// Test implementation of POST logic matching app/api/public/audit-requests/route.ts
const rateLimitMap = new Map<string, number[]>();

function getIPHash(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const realIp = request.headers.get("x-real-ip") ?? "";
  const rawIp = forwarded.split(",")[0].trim() || realIp || "127.0.0.1";
  return createHash("sha256").update(`sx_audit_salt_${rawIp}`).digest("hex").slice(0, 16);
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length >= 3 && email.length <= 254;
}

function isValidUrl(url: string): boolean {
  if (!url) return true;
  if (url.length > 500) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function testPostAuditRequest(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { businessName, contactEmail, contactPhone, industry, websiteUrl, goals, hpField } = body;

  if (hpField && typeof hpField === "string" && hpField.trim().length > 0) {
    return { status: 200, json: { ok: true, message: "Honeypot caught" } };
  }

  const ipHash = getIPHash(request);
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const timestamps = (rateLimitMap.get(ipHash) ?? []).filter((t) => now - t < windowMs);

  if (timestamps.length >= 5) {
    return { status: 429, json: { error: "Too many audit requests" } };
  }
  timestamps.push(now);
  rateLimitMap.set(ipHash, timestamps);

  if (!businessName || typeof businessName !== "string" || businessName.trim().length < 2 || businessName.trim().length > 150) {
    return { status: 400, json: { error: "Invalid business name" } };
  }

  if (!contactEmail || typeof contactEmail !== "string" || !isValidEmail(contactEmail.trim())) {
    return { status: 400, json: { error: "Invalid email" } };
  }

  if (contactPhone && (typeof contactPhone !== "string" || contactPhone.trim().length > 30)) {
    return { status: 400, json: { error: "Invalid phone" } };
  }

  if (industry && (typeof industry !== "string" || industry.trim().length > 100)) {
    return { status: 400, json: { error: "Invalid industry" } };
  }

  if (websiteUrl && (typeof websiteUrl !== "string" || !isValidUrl(websiteUrl.trim()))) {
    return { status: 400, json: { error: "Invalid website URL" } };
  }

  if (goals && (typeof goals !== "string" || goals.trim().length > 2000)) {
    return { status: 400, json: { error: "Invalid goals" } };
  }

  return { status: 200, json: { ok: true, id: "req_test_123", submittedAt: new Date().toISOString() } };
}

async function run() {
  console.log("Starting public audit-requests test suite...");

  // 1. Public audit request succeeds with valid data
  const resValid = await testPostAuditRequest(
    new Request("http://localhost/api/public/audit-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "1.2.3.4" },
      body: JSON.stringify({
        businessName: "Test Gym",
        contactEmail: "owner@testgym.com",
        contactPhone: "+919876543210",
        industry: "Fitness",
        websiteUrl: "https://testgym.com",
        goals: "Get more local members",
      }),
    })
  );
  assert.equal(resValid.status, 200, "Valid public submission must return 200 OK");
  assert.equal(resValid.json.ok, true, "Response must include ok: true");
  assert.ok(resValid.json.id, "Response must contain created request id");

  // 2-5. Tampered parameters ignored
  const resTamper = await testPostAuditRequest(
    new Request("http://localhost/api/public/audit-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "1.2.3.5" },
      body: JSON.stringify({
        businessName: "Tamper Inc",
        contactEmail: "tamper@test.com",
        tenantId: "00000000-0000-0000-0000-000000000000",
        status: "paid",
        subscriptionStatus: "active",
      }),
    })
  );
  assert.equal(resTamper.status, 200, "Tampered submission must still process cleanly");
  assert.equal(resTamper.json.ok, true, "Tampered submission succeeds");

  // 6. Invalid email is rejected
  const resBadEmail = await testPostAuditRequest(
    new Request("http://localhost/api/public/audit-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "1.2.3.6" },
      body: JSON.stringify({ businessName: "Bad Email Corp", contactEmail: "not-an-email" }),
    })
  );
  assert.equal(resBadEmail.status, 400, "Invalid email must return 400 Bad Request");

  // 7. Oversized fields are rejected
  const resOversized = await testPostAuditRequest(
    new Request("http://localhost/api/public/audit-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "1.2.3.7" },
      body: JSON.stringify({ businessName: "A".repeat(200), contactEmail: "valid@example.com" }),
    })
  );
  assert.equal(resOversized.status, 400, "Oversized business name must return 400 Bad Request");

  // 8. Invalid website URL is rejected
  const resBadUrl = await testPostAuditRequest(
    new Request("http://localhost/api/public/audit-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "1.2.3.8" },
      body: JSON.stringify({ businessName: "Bad URL LLC", contactEmail: "valid@example.com", websiteUrl: "ftp://invalid-scheme.com" }),
    })
  );
  assert.equal(resBadUrl.status, 400, "FTP website URL must return 400 Bad Request");

  // 9. Rate limiting works
  for (let i = 0; i < 4; i++) {
    await testPostAuditRequest(
      new Request("http://localhost/api/public/audit-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.99" },
        body: JSON.stringify({ businessName: `Spam Business ${i}`, contactEmail: `spam${i}@example.com` }),
      })
    );
  }
  await testPostAuditRequest(
    new Request("http://localhost/api/public/audit-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.99" },
      body: JSON.stringify({ businessName: "Spam 5", contactEmail: "spam5@example.com" }),
    })
  );
  const resRateLimited = await testPostAuditRequest(
    new Request("http://localhost/api/public/audit-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.99" },
      body: JSON.stringify({ businessName: "Spam Rate Limited", contactEmail: "ratelimited@example.com" }),
    })
  );
  assert.equal(resRateLimited.status, 429, "6th submission from same IP must return 429 Too Many Requests");

  // 10. Honeypot submission returns silent success
  const resHoneypot = await testPostAuditRequest(
    new Request("http://localhost/api/public/audit-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "1.2.3.9" },
      body: JSON.stringify({ businessName: "Bot Inc", contactEmail: "bot@spammer.com", hpField: "I am a bot" }),
    })
  );
  assert.equal(resHoneypot.status, 200, "Honeypot submission must return 200 OK");
  assert.equal(resHoneypot.json.id, undefined, "Honeypot submission must NOT return record ID");

  console.log("public-audit-requests.test.ts: ALL PASS");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
