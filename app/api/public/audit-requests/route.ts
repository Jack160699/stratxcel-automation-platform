import { getTenantServiceContext } from "../../../../lib/tenants/tenant-context.ts";
import { createHash } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// In-memory rate limiting map for basic abuse prevention per IP hash
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

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      businessName,
      contactEmail,
      contactPhone,
      industry,
      websiteUrl,
      goals,
      hpField, // Honeypot field
    } = body;

    // 1. Honeypot Bot Protection: If honeypot is filled, return silent success without saving
    if (hpField && typeof hpField === "string" && hpField.trim().length > 0) {
      return Response.json({
        ok: true,
        message: "Your audit request has been received. Our team will contact you.",
      });
    }

    // 2. Rate Limiting: Max 5 submissions per IP per 15 minutes
    const ipHash = getIPHash(request);
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const timestamps = (rateLimitMap.get(ipHash) ?? []).filter((t) => now - t < windowMs);

    if (timestamps.length >= 5) {
      return Response.json(
        { error: "Too many audit requests submitted. Please try again later." },
        { status: 429 }
      );
    }
    timestamps.push(now);
    rateLimitMap.set(ipHash, timestamps);

    // 3. Validation
    if (!businessName || typeof businessName !== "string" || businessName.trim().length < 2 || businessName.trim().length > 150) {
      return Response.json({ error: "Please enter a valid business name (2 to 150 characters)." }, { status: 400 });
    }

    if (!contactEmail || typeof contactEmail !== "string" || !isValidEmail(contactEmail.trim())) {
      return Response.json({ error: "Please enter a valid contact email address." }, { status: 400 });
    }

    if (contactPhone && (typeof contactPhone !== "string" || contactPhone.trim().length > 30)) {
      return Response.json({ error: "Contact phone number cannot exceed 30 characters." }, { status: 400 });
    }

    if (industry && (typeof industry !== "string" || industry.trim().length > 100)) {
      return Response.json({ error: "Industry cannot exceed 100 characters." }, { status: 400 });
    }

    if (websiteUrl && (typeof websiteUrl !== "string" || !isValidUrl(websiteUrl.trim()))) {
      return Response.json({ error: "Please enter a valid website URL starting with http:// or https://" }, { status: 400 });
    }

    if (goals && (typeof goals !== "string" || goals.trim().length > 2000)) {
      return Response.json({ error: "Goals text cannot exceed 2000 characters." }, { status: 400 });
    }

    // 4. Server-assigned trusted metadata
    const userAgent = request.headers.get("user-agent")?.slice(0, 300) ?? null;
    const { supabase: serviceDb } = getTenantServiceContext();

    const { data, error: insertErr } = await serviceDb
      .from("public_audit_requests")
      .insert({
        business_name: businessName.trim(),
        contact_email: contactEmail.trim().toLowerCase(),
        contact_phone: contactPhone ? contactPhone.trim() : null,
        industry: industry ? industry.trim() : null,
        website_url: websiteUrl ? websiteUrl.trim() : null,
        goals: goals ? goals.trim() : null,
        source: "public_audit_page",
        status: "new",
        requested_product: "audit_fee",
        request_ip_hash: ipHash,
        user_agent: userAgent,
      })
      .select("id, submitted_at")
      .single();

    if (insertErr) {
      console.error("[Public Audit Request Error]", insertErr.message);
      return Response.json({ error: "Failed to submit audit request. Please try again." }, { status: 500 });
    }

    return Response.json({
      ok: true,
      id: data.id,
      submittedAt: data.submitted_at,
      message: "Your audit request has been received. Our team will contact you to confirm scope, payment and delivery.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to process audit request";
    return Response.json({ error: msg }, { status: 400 });
  }
}
