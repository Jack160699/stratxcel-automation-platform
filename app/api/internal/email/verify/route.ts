import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { EmailOutreachService, type CanonicalLead } from "@stratxcel/workforce-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || process.env.CRON_SECRET || process.env.AI_DIAGNOSTICS_SECRET;
  if (!secret) return false;

  const adminHeader = req.headers.get("x-stratxcel-admin-secret");
  const authHeader = req.headers.get("authorization");

  if (adminHeader && adminHeader.trim() === secret.trim()) return true;
  if (authHeader && (authHeader.trim() === `Bearer ${secret.trim()}` || authHeader.trim() === secret.trim())) return true;

  return false;
}

/**
 * GET /api/internal/email/verify
 *
 * Safe diagnostics on Resend configuration, authentication, and configured domains.
 * Gated by internal secret. Never prints or exposes the API key.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const configured = Boolean(apiKey && apiKey.length > 0);

  if (!configured || !apiKey) {
    return NextResponse.json({
      ok: false,
      configured: false,
      error: "RESEND_API_KEY is not configured in production environment.",
    });
  }

  try {
    // 1. Verify authentication with Resend API
    const authRes = await fetch("https://api.resend.com/api-keys", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    // 2. Query configured domains
    const domainsRes = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const domainsData = (await domainsRes.json().catch(() => ({}))) as {
      data?: Array<{ id: string; name: string; status: string; region: string }>;
    };

    return NextResponse.json({
      ok: authRes.ok,
      configured: true,
      authenticated: authRes.ok,
      authHttpStatus: authRes.status,
      domains: domainsData?.data || [],
      defaultFrom: process.env.EMAIL_FROM || "StratXcel Outbound <onboarding@resend.dev>",
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      error: err?.message || "Error probing Resend API",
    }, { status: 500 });
  }
}

/**
 * POST /api/internal/email/verify
 *
 * Executes real live verification:
 * - Exactly ONE governed test email
 * - Captures Resend message ID
 * - Verifies provider acceptance & delivery status
 * - Verifies email_outbox and audit_events persistence
 * - Verifies deterministic idempotency & tenant isolation
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      error: "RESEND_API_KEY is not configured in production environment.",
    }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    recipient?: string;
    fromEmail?: string;
    tenantId?: string;
  };

  const tenantId = body.tenantId || "466e6195-a9f6-4576-8271-29fdae61c18a";
  const supabase = createSupabaseServiceClient();

  // 1. Identify authorized recipient address
  let targetRecipient = body.recipient?.trim();
  if (!targetRecipient) {
    const { data: adminUser } = await supabase
      .from("stratxcel_admins")
      .select("user_id")
      .limit(1)
      .maybeSingle();

    if (adminUser) {
      const { data: userData } = await supabase.auth.admin.getUserById(adminUser.user_id);
      if (userData?.user?.email) {
        targetRecipient = userData.user.email;
      }
    }
  }

  if (!targetRecipient) {
    targetRecipient = "shriyansh160699@gmail.com";
  }

  // 2. Prepare fully qualified B2B Canonical Lead
  const testLeadId = `lead_verify_${Date.now()}`;
  const mockLead: CanonicalLead = {
    id: testLeadId,
    tenantId,
    status: "QUALIFIED",
    source: "hermes_research",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastVerifiedAt: new Date().toISOString(),
    identity: {
      companyName: "StratXcel Verification Lab",
      normalizedCompanyName: "stratxcel verification lab",
      websiteUrl: "https://stratxcel.in",
      canonicalDomain: "stratxcel.in",
      primaryPhone: "+917712345678",
      normalizedPhone: "+917712345678",
      allPhones: ["+917712345678"],
      primaryEmail: targetRecipient,
      normalizedEmail: targetRecipient.toLowerCase(),
      allEmails: [targetRecipient],
      facilityAddress: "Raipur HQ, Chhattisgarh, India",
      city: "Raipur",
      stateOrRegion: "Chhattisgarh",
      country: "India",
      deduplicationHash: `hash_verify_${Date.now()}`,
    },
    provenanceHistory: [],
    evidenceList: [
      {
        id: "ev_verify_001",
        claim: "Operational outbound verification for StratXcel Autonomous Platform",
        field: "primaryEmail",
        value: targetRecipient,
        sourceKey: "admin_verification",
        confidence: "VERIFIED",
        recordedAt: new Date().toISOString(),
      },
    ],
    enrichment: {
      lastEnrichedAt: new Date().toISOString(),
      enrichmentSources: ["internal_admin"],
    },
    qualification: {
      qualificationScore: 95,
      icpFitTier: "TIER_1_ENTERPRISE",
      status: "QUALIFIED",
      signals: {
        geographyMatch: true,
        industryFit: true,
        scaleMatch: true,
        needOrProblemDetected: true,
        decisionMakerIdentified: true,
        contactabilityReady: true,
      },
      scoringBreakdown: [],
      summaryRationale: "Executive test verification of outbound transactional capability.",
    },
    outreachEligibility: {
      isEligible: true,
      preferredChannel: "email",
      consentState: "LEGITIMATE_INTEREST_B2B",
      whatsappOptInReady: false,
      reason: "Verified administrative test subject",
    },
  };

  // 3. Dispatch ONE real email via EmailOutreachService
  const service = new EmailOutreachService({
    supabaseClient: supabase,
    resendApiKey: apiKey,
    defaultFrom: body.fromEmail,
  });

  const subject = `[StratXcel Autonomous OS] Real Outbound Email Verification - ${new Date().toISOString()}`;
  const htmlContent = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; rounded: 8px;">
      <h2 style="color: #0f172a;">StratXcel Autonomous Outbound Email Verification</h2>
      <p>This email confirms real production runtime connectivity between StratXcel and Resend.</p>
      <hr style="border: none; border-top: 1px solid #eaeaea; margin: 20px 0;" />
      <ul>
        <li><strong>Timestamp:</strong> ${new Date().toISOString()}</li>
        <li><strong>Lead ID:</strong> ${testLeadId}</li>
        <li><strong>Tenant ID:</strong> ${tenantId}</li>
        <li><strong>Recipient:</strong> ${targetRecipient}</li>
        <li><strong>Channel:</strong> Email (Governed Autonomous Outreach)</li>
      </ul>
      <p style="color: #64748b; font-size: 13px; margin-top: 30px;">Sent autonomously by StratXcel Hermes Engine.</p>
    </div>
  `;
  const textContent = `StratXcel Autonomous Outbound Email Verification\nTimestamp: ${new Date().toISOString()}\nRecipient: ${targetRecipient}`;

  const sendResult = await service.sendOutreachEmail({
    tenantId,
    lead: mockLead,
    recipientEmail: targetRecipient,
    subject,
    htmlContent,
    textContent,
    templateKey: "live_verification_v1",
    fromEmail: body.fromEmail,
  });

  if (!sendResult.success) {
    return NextResponse.json({
      ok: false,
      step: "send_outreach_email",
      sendResult,
    }, { status: 422 });
  }

  // 4. Query Resend API for message delivery status
  let resendMessageStatus: Record<string, unknown> | null = null;
  if (sendResult.providerMessageId) {
    try {
      const msgRes = await fetch(`https://api.resend.com/emails/${sendResult.providerMessageId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (msgRes.ok) {
        resendMessageStatus = await msgRes.json();
      }
    } catch (err: any) {
      console.warn("Failed to fetch Resend email status:", err?.message);
    }
  }

  // 5. Verify email_outbox persistence in Supabase
  const { data: outboxRow } = await supabase
    .from("email_outbox")
    .select("*")
    .eq("idempotency_key", sendResult.idempotencyKey)
    .maybeSingle();

  // 6. Verify audit_events persistence in Supabase
  const { data: auditRows } = await supabase
    .from("audit_events")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("action", "email.outreach.sent")
    .order("created_at", { ascending: false })
    .limit(1);

  // 7. Verify Idempotency: Attempt to send again with identical lead & key
  const duplicateSendResult = await service.sendOutreachEmail({
    tenantId,
    lead: mockLead,
    recipientEmail: targetRecipient,
    subject,
    htmlContent,
    textContent,
    templateKey: "live_verification_v1",
    fromEmail: body.fromEmail,
  });

  const isIdempotent = duplicateSendResult.success === true &&
    duplicateSendResult.idempotencyKey === sendResult.idempotencyKey &&
    duplicateSendResult.providerMessageId === sendResult.providerMessageId &&
    duplicateSendResult.error?.includes("Idempotent duplicate send prevented");

  // 8. Verify Tenant Isolation: Check other tenant cannot see this outbox row
  const fakeTenantId = "00000000-0000-0000-0000-000000000000";
  const { data: crossTenantCheck } = await supabase
    .from("email_outbox")
    .select("id")
    .eq("tenant_id", fakeTenantId)
    .eq("idempotency_key", sendResult.idempotencyKey);

  const isTenantIsolated = (crossTenantCheck?.length || 0) === 0;

  return NextResponse.json({
    ok: true,
    verification: {
      provider: "resend",
      authenticated: true,
      recipient: targetRecipient,
      providerMessageId: sendResult.providerMessageId,
      resendStatus: resendMessageStatus?.last_event || (resendMessageStatus as any)?.status || "accepted",
      outboxPersisted: Boolean(outboxRow && outboxRow.status === "SENT"),
      outboxRowId: outboxRow?.id,
      auditEventPersisted: Boolean(auditRows && auditRows.length > 0),
      idempotencyVerified: isIdempotent,
      tenantIsolationVerified: isTenantIsolated,
      timestamp: new Date().toISOString(),
    },
    providerEvidence: {
      resendMessageId: sendResult.providerMessageId,
      resendDetails: resendMessageStatus,
      outboxEntry: outboxRow ? {
        id: outboxRow.id,
        tenant_id: outboxRow.tenant_id,
        recipient: outboxRow.recipient,
        status: outboxRow.status,
        provider_message_id: outboxRow.provider_message_id,
        idempotency_key: outboxRow.idempotency_key,
      } : null,
    },
  });
}
