import type { ServiceClient } from "../db.ts";
import { generateDisplayCode, hashCode } from "../crypto.ts";
import { activateWhatsAppPrincipal } from "../principals/repository.ts";

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000; // ~10 minutes, per spec

export interface CreatePairingChallengeInput {
  authUserId: string;
  principalType: "staff" | "client";
  tenantId: string | null;
}

export interface PairingChallenge {
  /** Plaintext code — returned exactly once to the authenticated caller. Never persisted. */
  code: string;
  expiresAt: string;
}

export async function createPairingChallenge(
  supabase: ServiceClient,
  input: CreatePairingChallengeInput
): Promise<PairingChallenge> {
  if (input.principalType === "client" && !input.tenantId) {
    throw new Error("agent-core: client pairing requires tenantId");
  }

  const code = generateDisplayCode();
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS).toISOString();

  const { error } = await supabase.from("whatsapp_channel_pairing_codes").insert({
    code_hash: hashCode(code),
    auth_user_id: input.authUserId,
    tenant_id: input.tenantId,
    principal_type: input.principalType,
    expires_at: expiresAt,
  });
  if (error) throw error;

  return { code, expiresAt };
}

export type ConsumePairingResult =
  | { ok: true; authUserId: string; principalType: "staff" | "client"; tenantId: string | null }
  | { ok: false; reason: "not_found" | "expired" | "already_used" };

/**
 * Consume a pairing code for a given sender phone. Validates the code against
 * its hash, expiry, and single-use status in one atomic conditional UPDATE
 * (no separate check-then-update race window), then activates the WhatsApp
 * channel principal.
 *
 * Does NOT trust a "LINK ADMIN" keyword from the message text to decide role —
 * the principal_type is whatever was set server-side when the authenticated
 * user requested the pairing code (see PHASE 19 in the task brief).
 */
export async function consumePairingChallenge(
  supabase: ServiceClient,
  normalizedPhone: string,
  code: string
): Promise<ConsumePairingResult> {
  const codeHash = hashCode(code);
  const nowIso = new Date().toISOString();

  const { data: candidate, error: findErr } = await supabase
    .from("whatsapp_channel_pairing_codes")
    .select("id, auth_user_id, tenant_id, principal_type, expires_at, used_at")
    .eq("code_hash", codeHash)
    .maybeSingle<{
      id: string;
      auth_user_id: string;
      tenant_id: string | null;
      principal_type: "staff" | "client";
      expires_at: string;
      used_at: string | null;
    }>();
  if (findErr) throw findErr;
  if (!candidate) return { ok: false, reason: "not_found" };
  if (candidate.used_at) return { ok: false, reason: "already_used" };
  if (new Date(candidate.expires_at).getTime() <= Date.now()) return { ok: false, reason: "expired" };

  // Atomic single-use claim: only succeeds if still unused at write time.
  const { data: claimed, error: claimErr } = await supabase
    .from("whatsapp_channel_pairing_codes")
    .update({ used_at: nowIso })
    .eq("id", candidate.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (claimErr) throw claimErr;
  if (!claimed) return { ok: false, reason: "already_used" };

  await activateWhatsAppPrincipal(supabase, {
    normalizedPhone,
    principalType: candidate.principal_type,
    authUserId: candidate.auth_user_id,
    tenantId: candidate.tenant_id,
  });

  return {
    ok: true,
    authUserId: candidate.auth_user_id,
    principalType: candidate.principal_type,
    tenantId: candidate.tenant_id,
  };
}
