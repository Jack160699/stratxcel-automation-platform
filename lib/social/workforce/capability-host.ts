/**
 * Binds real Social schedule/publish into Workforce capability providers.
 */
import {
  bindCapabilityHost,
  type SocialPublishHostInput,
  type SocialPublishHostResult,
  type SocialScheduleHostInput,
  type SocialScheduleHostResult,
} from "@stratxcel/workforce-core";
import { createSupabaseServiceClient } from "../../supabase/service.ts";
import { scheduleJob } from "../repositories/publishing.ts";
import { runPublishNow } from "../agent/publish-outcome.ts";
import { buildScheduleIntent } from "./schedule.ts";
import { assertAccountInTenant, assertSameTenant } from "./tenant-scope.ts";
import { decideManualPublishGate } from "./authorization.ts";
import { externalMutationDecision } from "../shadow-gate.ts";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

async function loadAccount(service: ServiceClient, accountId: string) {
  const { data, error } = await service
    .from("social_accounts")
    .select("id, tenant_id, status, platform, owner_id")
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as {
    id: string;
    tenant_id: string | null;
    status: string;
    platform: string | null;
    owner_id: string | null;
  } | null;
}

async function loadVariant(service: ServiceClient, variantId: string) {
  const { data, error } = await service
    .from("content_variants")
    .select("id, account_id, status, payload_fingerprint, tenant_id")
    .eq("id", variantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as {
    id: string;
    account_id: string;
    status: string;
    payload_fingerprint: string | null;
    tenant_id: string | null;
  } | null;
}

async function socialSchedule(input: SocialScheduleHostInput): Promise<SocialScheduleHostResult> {
  try {
    const service = createSupabaseServiceClient();
    const account = await loadAccount(service, input.accountId);
    assertAccountInTenant(
      input.tenantId,
      account
        ? {
            id: account.id,
            tenantId: account.tenant_id as string,
            status: account.status,
            platform: account.platform ?? "unknown",
          }
        : null,
    );

    const variant = await loadVariant(service, input.variantId);
    if (!variant) {
      return { ok: false, errorCategory: "INVALID_INPUT", errorMessage: "variant_not_found" };
    }
    if (variant.account_id !== input.accountId) {
      return { ok: false, errorCategory: "POLICY_BLOCK", errorMessage: "TENANT_FORBIDDEN" };
    }
    if (variant.tenant_id) assertSameTenant(input.tenantId, variant.tenant_id, "variant");

    const status = String(variant.status).toUpperCase();
    if (!["APPROVED", "READY", "FINAL", "SCHEDULED"].includes(status)) {
      return {
        ok: false,
        errorCategory: "POLICY_BLOCK",
        errorMessage: "approved_canonical_variant_required",
      };
    }

    const hasAuth =
      input.approvalGranted === true ||
      (input.standingAuthorizationGranted === true &&
        input.standingAuthorizationCapability === "social.schedule");
    if (!hasAuth) {
      return { ok: false, errorCategory: "POLICY_BLOCK", errorMessage: "APPROVAL_REQUIRED" };
    }

    buildScheduleIntent({
      kind: "AT",
      timeZone: input.timeZone,
      scheduledAtIso: input.scheduledAtIso,
    });

    const jobId = await scheduleJob(service, {
      accountId: input.accountId,
      variantId: input.variantId,
      scheduledAt: input.scheduledAtIso,
      idempotencyKey: input.idempotencyKey,
    });

    return {
      ok: true,
      jobId,
      status: "SCHEDULED",
      receiptDetail: {
        accountId: input.accountId,
        variantId: input.variantId,
        artifactId: input.artifactId ?? null,
        platform: account?.platform ?? null,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const tenant = /cross_tenant|tenant_/i.test(message);
    return {
      ok: false,
      errorCategory: tenant ? "POLICY_BLOCK" : "PROVIDER_FAILURE",
      errorMessage: tenant ? "TENANT_FORBIDDEN" : message.slice(0, 500),
    };
  }
}

async function socialPublish(input: SocialPublishHostInput): Promise<SocialPublishHostResult> {
  try {
    if (input.killSwitchActive) {
      return { ok: false, errorCategory: "POLICY_BLOCK", errorMessage: "KILL_SWITCH_ACTIVE" };
    }
    const shadow = externalMutationDecision(Boolean(input.shadowMode), "publish_post");
    if (!shadow.allowed) {
      return {
        ok: false,
        errorCategory: "POLICY_BLOCK",
        errorMessage: "SHADOW_BLOCKED",
        shadowPreventedMutation: true,
        externalMutationOccurred: false,
      };
    }

    const standingOk =
      input.standingAuthorizationGranted === true &&
      input.standingAuthorizationCapability === "social.publish";
    const gate = decideManualPublishGate({
      explicitApprovalControl: input.approvalGranted === true || standingOk,
      actionId: input.approvalGranted || standingOk ? input.requestId : null,
      shadowMode: false,
      qualityStatus: "PASS",
      complianceStatus: "PASS",
      exactArtifactVersion: input.artifactVersion ?? undefined,
      releaseReadiness: input.artifactVersion
        ? { readyToRelease: true, reviewedArtifactVersion: input.artifactVersion }
        : undefined,
    });
    if (!gate.allowed) {
      return {
        ok: false,
        errorCategory: "POLICY_BLOCK",
        errorMessage: gate.reason,
        shadowPreventedMutation: gate.shadowBlocked,
      };
    }

    const service = createSupabaseServiceClient();
    const account = await loadAccount(service, input.accountId);
    assertAccountInTenant(
      input.tenantId,
      account
        ? {
            id: account.id,
            tenantId: account.tenant_id as string,
            status: account.status,
            platform: account.platform ?? "unknown",
          }
        : null,
    );

    const variant = await loadVariant(service, input.variantId);
    if (!variant) {
      return { ok: false, errorCategory: "INVALID_INPUT", errorMessage: "variant_not_found" };
    }
    if (variant.account_id !== input.accountId) {
      return { ok: false, errorCategory: "POLICY_BLOCK", errorMessage: "TENANT_FORBIDDEN" };
    }
    if (variant.tenant_id) assertSameTenant(input.tenantId, variant.tenant_id, "variant");

    if (
      input.exactPayloadFingerprint &&
      variant.payload_fingerprint &&
      input.exactPayloadFingerprint !== variant.payload_fingerprint
    ) {
      return {
        ok: false,
        errorCategory: "POLICY_BLOCK",
        errorMessage: "artifact_modified_after_approval",
      };
    }

    const accountOwnerId = account?.owner_id ?? null;
    if (!accountOwnerId) {
      return {
        ok: false,
        errorCategory: "AUTH_CONFIGURATION",
        errorMessage: "account_owner_missing",
      };
    }
    if (input.ownerId && input.ownerId !== accountOwnerId) {
      return {
        ok: false,
        errorCategory: "POLICY_BLOCK",
        errorMessage: "owner_mismatch",
      };
    }

    const scheduledAt = input.scheduledAtIso ?? new Date().toISOString();
    const jobId = await scheduleJob(service, {
      accountId: input.accountId,
      variantId: input.variantId,
      scheduledAt,
      idempotencyKey: input.idempotencyKey,
    });

    const outcome = await runPublishNow(service, jobId, scheduledAt, accountOwnerId, {
      platform: account?.platform ?? undefined,
    });

    const jobStatus = String(outcome.jobStatus).toUpperCase();
    const published = jobStatus === "PUBLISHED" && Boolean(outcome.externalPostId);

    if (jobStatus === "PUBLISHED" && !outcome.externalPostId) {
      return {
        ok: false,
        errorCategory: "PROVIDER_FAILURE",
        errorMessage: "missing_external_receipt",
        jobId: outcome.jobId,
        jobStatus: outcome.jobStatus,
        externalMutationOccurred: false,
      };
    }

    return {
      ok: true,
      jobId: outcome.jobId,
      jobStatus: outcome.jobStatus,
      providerPostId: outcome.externalPostId ?? null,
      publishedAtIso: outcome.publishedAt ?? null,
      platform: outcome.platform ?? account?.platform ?? null,
      liveUrl: outcome.permalink ?? null,
      externalMutationOccurred: published,
      receiptDetail: {
        artifactId: input.artifactId,
        outcomeNote: outcome.outcomeNote,
        mode: outcome.mode ?? null,
        ownerDerivedFromAccount: true,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const tenant = /cross_tenant|tenant_/i.test(message);
    return {
      ok: false,
      errorCategory: tenant ? "POLICY_BLOCK" : "PROVIDER_FAILURE",
      errorMessage: tenant ? "TENANT_FORBIDDEN" : message.slice(0, 500),
    };
  }
}

let bound = false;

export function ensureSocialCapabilityHostBound(): void {
  if (bound) return;
  bound = true;
  bindCapabilityHost({ socialSchedule, socialPublish });
}
