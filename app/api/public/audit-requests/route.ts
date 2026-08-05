import { getTenantServiceContext } from "../../../../lib/tenants/tenant-context.ts";
import { createHash } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// In-memory fallback map if DB RPC is unreachable
const memoryFallbackMap = new Map<string, number[]>();

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
      hpField, // Honeypot trap
      // Multi-step questionnaire answers payload
      auditAnswers,
      questionnaireVersion,
      completionPercentage,
      preferredContactMethod,
      preferredContactTime,
      consentToContact,
    } = body;

    // 1. Honeypot Bot Trap: Return silent success without saving if filled
    if (hpField && typeof hpField === "string" && hpField.trim().length > 0) {
      return Response.json({
        ok: true,
        message: "Your audit request has been received. Our team will contact you.",
      });
    }

    // 2. Durable Rate Limiting via Supabase RPC with memory fallback
    const ipHash = getIPHash(request);
    const { supabase: serviceDb } = getTenantServiceContext();

    let isAllowed = true;
    try {
      const { data: rpcAllowed, error: rpcErr } = await serviceDb.rpc(
        "check_and_increment_audit_rate_limit",
        {
          p_ip_hash: ipHash,
          p_max_requests: 5,
          p_window_seconds: 900,
        }
      );
      if (!rpcErr && typeof rpcAllowed === "boolean") {
        isAllowed = rpcAllowed;
      } else {
        // Fallback to in-memory check if RPC not available
        const now = Date.now();
        const timestamps = (memoryFallbackMap.get(ipHash) ?? []).filter((t) => now - t < 15 * 60 * 1000);
        if (timestamps.length >= 5) {
          isAllowed = false;
        } else {
          timestamps.push(now);
          memoryFallbackMap.set(ipHash, timestamps);
        }
      }
    } catch {
      // Memory fallback
      const now = Date.now();
      const timestamps = (memoryFallbackMap.get(ipHash) ?? []).filter((t) => now - t < 15 * 60 * 1000);
      if (timestamps.length >= 5) isAllowed = false;
      else {
        timestamps.push(now);
        memoryFallbackMap.set(ipHash, timestamps);
      }
    }

    if (!isAllowed) {
      return Response.json(
        { error: "Too many audit requests submitted from this network. Please try again later." },
        { status: 429 }
      );
    }

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
        // Expanded questionnaire payload
        audit_answers: typeof auditAnswers === "object" && auditAnswers !== null ? auditAnswers : {},
        questionnaire_version: typeof questionnaireVersion === "string" ? questionnaireVersion : "v2_multistep",
        completion_percentage: typeof completionPercentage === "number" ? Math.min(100, Math.max(0, completionPercentage)) : 100,
        preferred_contact_method: typeof preferredContactMethod === "string" ? preferredContactMethod.slice(0, 50) : null,
        preferred_contact_time: typeof preferredContactTime === "string" ? preferredContactTime.slice(0, 50) : null,
        consent_to_contact: consentToContact !== false,
        consent_recorded_at: new Date().toISOString(),
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
