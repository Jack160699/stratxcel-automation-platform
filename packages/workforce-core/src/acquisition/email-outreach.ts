/**
 * Autonomous Email Outreach Service
 * StratXcel Autonomous Company OS - Workforce Core
 *
 * Implements secondary autonomous outreach using provider-neutral email architecture.
 *
 * Core Principles:
 * - Free-First: Designed for Resend Free Tier (100 emails/day, 3,000/month).
 * - Governed Outreach: A discovered email DOES NOT equal permission to send.
 *   Enforces strict gatekeeper verification: consent, opt-out suppression,
 *   qualification score threshold, and tenant outreach policy.
 * - Zero Synthetic Delivery: Real provider execution, real idempotency,
 *   real outbox persistence, real audit logging, strict tenant isolation.
 */

import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanonicalLead, OutreachEligibility } from "./types.ts";
import { evaluateOutreachEligibility, type OutreachPolicyConfig } from "./outreach-gatekeeper.ts";

export interface OutreachEmailRequest {
  tenantId: string;
  lead: CanonicalLead;
  recipientEmail?: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  templateKey?: string;
  fromEmail?: string;
  replyTo?: string;
  dryRun?: boolean;
}

export interface OutreachEmailResult {
  success: boolean;
  status: "SENT" | "SUPPRESSED" | "INELIGIBLE" | "FAILED" | "SETUP_REQUIRED";
  idempotencyKey: string;
  provider: string;
  providerMessageId?: string;
  error?: string;
  errorCode?: string;
  gatekeeperEligibility?: OutreachEligibility;
  outboxRowId?: string;
  auditEventId?: string;
}

export class EmailOutreachService {
  private supabase: SupabaseClient | null;
  private resendApiKey: string | null;
  private defaultFrom: string;

  constructor(options?: {
    supabaseClient?: SupabaseClient | null;
    resendApiKey?: string | null;
    defaultFrom?: string;
  }) {
    this.supabase = options?.supabaseClient || null;
    this.resendApiKey =
      options?.resendApiKey ||
      process.env.RESEND_API_KEY?.trim() ||
      null;
    this.defaultFrom =
      options?.defaultFrom ||
      process.env.EMAIL_FROM?.trim() ||
      "StratXcel Outbound <onboarding@resend.dev>";
  }

  /**
   * Evaluates lead outreach eligibility and sends governed B2B outreach email.
   */
  async sendOutreachEmail(
    request: OutreachEmailRequest,
    policyConfig?: OutreachPolicyConfig
  ): Promise<OutreachEmailResult> {
    const { tenantId, lead } = request;
    const recipient = request.recipientEmail || lead.identity.primaryEmail || lead.identity.normalizedEmail;
    const templateKey = request.templateKey || "b2b_growth_outreach_v1";

    // 1. Recipient Validation
    if (!recipient || !recipient.includes("@")) {
      return {
        success: false,
        status: "INELIGIBLE",
        idempotencyKey: "",
        provider: "resend",
        error: "No valid recipient email address found for this lead.",
        errorCode: "MISSING_EMAIL",
      };
    }

    // 2. Outreach Gatekeeper Evaluation (Consent, Suppression, ICP score)
    const eligibility = evaluateOutreachEligibility(lead, {
      tenantId,
      ...policyConfig,
    });

    if (!eligibility.isEligible) {
      return {
        success: false,
        status: eligibility.consentState === "OPT_OUT" ? "SUPPRESSED" : "INELIGIBLE",
        idempotencyKey: "",
        provider: "resend",
        gatekeeperEligibility: eligibility,
        error: `Outreach gatekeeper blocked send: ${eligibility.reason}`,
        errorCode: eligibility.suppressionReason || "GATEKEEPER_REJECTED",
      };
    }

    // 3. Deterministic Idempotency Key
    // outreach:{tenantId}:{leadIdOrHash}:{templateKey}
    const leadKey = lead.id || lead.identity.deduplicationHash;
    const idempotencyKey = createHash("sha256")
      .update(`outreach:${tenantId}:${leadKey}:${templateKey}`)
      .digest("hex");

    const recipientHash = createHash("sha256")
      .update(recipient.toLowerCase().trim())
      .digest("hex");

    // 4. Check existing outbox row to prevent duplicate send
    if (this.supabase) {
      const { data: existingOutbox } = await this.supabase
        .from("email_outbox")
        .select("id, status, provider_message_id")
        .eq("tenant_id", tenantId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (existingOutbox && existingOutbox.status === "SENT") {
        return {
          success: true,
          status: "SENT",
          idempotencyKey,
          provider: "resend",
          providerMessageId: existingOutbox.provider_message_id,
          outboxRowId: existingOutbox.id,
          error: "Idempotent duplicate send prevented. Email was previously delivered.",
        };
      }
    }

    // 5. Provider Execution Check
    const apiKey = this.resendApiKey || process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      // Record truthful failure in outbox and audit log if DB connected
      let outboxRowId: string | undefined;
      if (this.supabase) {
        const { data: outboxRow } = await this.supabase
          .from("email_outbox")
          .insert({
            tenant_id: tenantId,
            event_type: "OUTREACH_PROSPECT",
            recipient,
            recipient_hash: recipientHash,
            template_key: templateKey,
            template_version: 1,
            subject: request.subject,
            payload: {
              companyName: lead.identity.companyName,
              qualificationScore: lead.qualification.qualificationScore,
              consentState: eligibility.consentState,
            },
            idempotency_key: idempotencyKey,
            provider: "resend",
            status: "FAILED",
            last_error_code: "NOT_CONFIGURED",
            last_error_safe: "RESEND_API_KEY is not configured in environment.",
          })
          .select("id")
          .single();

        outboxRowId = outboxRow?.id;

        // Record audit event
        await this.supabase.from("audit_events").insert({
          tenant_id: tenantId,
          actor_kind: "hermes",
          action: "email.outreach.blocked",
          target_type: "crm_lead",
          target_id: leadKey,
          metadata: {
            reason: "RESEND_API_KEY is not configured",
            recipientHash,
            idempotencyKey,
          },
        });
      }

      return {
        success: false,
        status: "SETUP_REQUIRED",
        idempotencyKey,
        provider: "resend",
        outboxRowId,
        error: "RESEND_API_KEY is not configured. Free-tier key (re_...) required for outbound sends.",
        errorCode: "NOT_CONFIGURED",
      };
    }

    // 6. Real Provider Execution via Resend API
    let providerMessageId: string | undefined;
    let sendError: string | undefined;
    let sendErrorCode: string | undefined;

    try {
      const fromAddress = request.fromEmail || this.defaultFrom;
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [recipient],
          subject: request.subject,
          html: request.htmlContent,
          text: request.textContent,
          reply_to: request.replyTo,
          headers: {
            "X-StratXcel-Tenant": tenantId,
            "X-StratXcel-Lead": leadKey,
            "List-Unsubscribe": `<mailto:unsubscribe@stratxcel.in?subject=unsubscribe-${tenantId}>`,
          },
        }),
      });

      const resData = (await resendRes.json().catch(() => ({}))) as {
        id?: string;
        message?: string;
        name?: string;
        statusCode?: number;
      };

      if (!resendRes.ok || !resData.id) {
        sendError = resData.message || resData.name || `Resend error ${resendRes.status}`;
        sendErrorCode = `HTTP_${resendRes.status}`;
      } else {
        providerMessageId = resData.id;
      }
    } catch (err: any) {
      sendError = err.message;
      sendErrorCode = "NETWORK_ERROR";
    }

    const isSuccess = Boolean(providerMessageId && !sendError);

    // 7. Durable Outbox Persistence
    let outboxRowId: string | undefined;
    let auditEventId: string | undefined;

    if (this.supabase) {
      try {
        const { data: outboxRow } = await this.supabase
          .from("email_outbox")
          .insert({
            tenant_id: tenantId,
            event_type: "OUTREACH_PROSPECT",
            recipient,
            recipient_hash: recipientHash,
            template_key: templateKey,
            template_version: 1,
            subject: request.subject,
            payload: {
              companyName: lead.identity.companyName,
              qualificationScore: lead.qualification.qualificationScore,
              consentState: eligibility.consentState,
              industry: lead.enrichment.subIndustry || "Commercial",
            },
            idempotency_key: idempotencyKey,
            provider: "resend",
            provider_message_id: providerMessageId || null,
            status: isSuccess ? "SENT" : "FAILED",
            sent_at: isSuccess ? new Date().toISOString() : null,
            last_error_code: sendErrorCode || null,
            last_error_safe: sendError || null,
          })
          .select("id")
          .single();

        outboxRowId = outboxRow?.id;

        // 8. Immutable Audit Trail
        const { data: auditRow } = await this.supabase
          .from("audit_events")
          .insert({
            tenant_id: tenantId,
            actor_kind: "hermes",
            action: isSuccess ? "email.outreach.sent" : "email.outreach.failed",
            target_type: "crm_lead",
            target_id: leadKey,
            metadata: {
              recipientHash,
              idempotencyKey,
              providerMessageId,
              status: isSuccess ? "SENT" : "FAILED",
              templateKey,
              errorCode: sendErrorCode,
            },
          })
          .select("id")
          .single();

        auditEventId = auditRow?.id;

        // 9. Update CRM Lead Interaction State
        if (isSuccess && lead.id) {
          await this.supabase
            .from("crm_leads")
            .update({
              status: "CONTACTED",
              last_interaction_at: new Date().toISOString(),
            })
            .eq("id", lead.id)
            .eq("tenant_id", tenantId);
        }
      } catch (dbErr: any) {
        console.warn("[EmailOutreachService] DB persistence warning:", dbErr.message);
      }
    }

    return {
      success: isSuccess,
      status: isSuccess ? "SENT" : "FAILED",
      idempotencyKey,
      provider: "resend",
      providerMessageId,
      error: sendError,
      errorCode: sendErrorCode,
      gatekeeperEligibility: eligibility,
      outboxRowId,
      auditEventId,
    };
  }
}
