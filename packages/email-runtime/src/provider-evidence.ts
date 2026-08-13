import type { EmailOutboxStatus } from "./types.ts";

/**
 * Latest meaningful provider evidence for System Health and WAITING_CONFIGURATION recovery.
 * Configuration knowledge (key / EMAIL_FROM) is separate from this runtime proof.
 *
 * Never includes recipient addresses or secrets.
 */
export type EmailProviderEvidenceKind = "delivery_proof" | "auth_config" | "sender_unverified" | "none";

export interface EmailProviderEvidence {
  kind: EmailProviderEvidenceKind;
  observedAt: string | null;
  hasProviderMessageId: boolean;
  errorCode: string | null;
}

/** Columns needed to classify evidence — must not include recipient or payload. */
export interface ProviderEvidenceRow {
  status: EmailOutboxStatus | string;
  provider_message_id: string | null;
  last_error_code: string | null;
  sent_at: string | null;
  last_attempt_at: string | null;
  updated_at: string;
}

const AUTH_CODES = new Set(["HTTP_401", "HTTP_403", "AUTH_CONFIG"]);
const SENDER_UNVERIFIED_CODES = new Set(["SENDER_UNVERIFIED"]);

function observedAt(row: ProviderEvidenceRow, fallback: string): string {
  if (row.status === "SENT") {
    return row.sent_at || row.last_attempt_at || row.updated_at || fallback;
  }
  return row.last_attempt_at || row.updated_at || fallback;
}

export function classifyProviderEvidenceRow(row: ProviderEvidenceRow): EmailProviderEvidence | null {
  const messageId = typeof row.provider_message_id === "string" ? row.provider_message_id.trim() : "";
  if (row.status === "SENT" && messageId.length > 0) {
    return {
      kind: "delivery_proof",
      observedAt: observedAt(row, row.updated_at),
      hasProviderMessageId: true,
      errorCode: null,
    };
  }

  const code = (row.last_error_code ?? "").trim();
  if (AUTH_CODES.has(code)) {
    return {
      kind: "auth_config",
      observedAt: observedAt(row, row.updated_at),
      hasProviderMessageId: false,
      errorCode: code,
    };
  }
  if (SENDER_UNVERIFIED_CODES.has(code)) {
    return {
      kind: "sender_unverified",
      observedAt: observedAt(row, row.updated_at),
      hasProviderMessageId: false,
      errorCode: code,
    };
  }
  return null;
}

function evidenceRank(kind: EmailProviderEvidenceKind): number {
  if (kind === "auth_config" || kind === "sender_unverified") return 2;
  if (kind === "delivery_proof") return 1;
  return 0;
}

const EMPTY_EVIDENCE: EmailProviderEvidence = {
  kind: "none",
  observedAt: null,
  hasProviderMessageId: false,
  errorCode: null,
};

/**
 * Prefer the latest meaningful provider outcome.
 * Historical SENT does not win over a later auth/sender-unverified rejection.
 * Equal timestamps prefer the blocking failure.
 */
export function selectLatestProviderEvidence(rows: ProviderEvidenceRow[]): EmailProviderEvidence {
  let best: EmailProviderEvidence | null = null;
  for (const row of rows) {
    const candidate = classifyProviderEvidenceRow(row);
    if (!candidate || !candidate.observedAt) continue;
    if (!best || !best.observedAt) {
      best = candidate;
      continue;
    }
    if (candidate.observedAt > best.observedAt) {
      best = candidate;
      continue;
    }
    if (candidate.observedAt === best.observedAt && evidenceRank(candidate.kind) > evidenceRank(best.kind)) {
      best = candidate;
    }
  }
  return best ?? EMPTY_EVIDENCE;
}

export function emptyProviderEvidence(): EmailProviderEvidence {
  return { ...EMPTY_EVIDENCE };
}

/** Strip recipient addresses and secret-like tokens from health detail strings. */
export function sanitizeEmailHealthDetail(detail: string): string {
  return detail
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/re_[A-Za-z0-9_]+/g, "[redacted]")
    .replace(/sk_[A-Za-z0-9_]+/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .slice(0, 280);
}
