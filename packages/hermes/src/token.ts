import { signPayload, verifySignature } from "./signing.ts";
import type { ToolName } from "./types.ts";

export interface MissionTokenPayload {
  missionId: string;
  tenantId: string;
  allowedTools: ToolName[];
  issuedAtMs: number;
  expiresAtMs: number;
}

const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 minutes — long enough for a single mission run's tool calls, short enough that a leaked token stops mattering quickly.

function getSecret(): string {
  const secret = process.env.HERMES_GATEWAY_SECRET;
  if (!secret) throw new Error("HERMES_GATEWAY_SECRET is not set — required to issue or verify mission tokens");
  return secret;
}

/**
 * Short-lived, mission-scoped authorization for apps/hermes-gateway's tool
 * endpoints. This is what stands in for "raw Supabase/social/Razorpay
 * credentials" in Hermes's hands — Hermes gets exactly this token, scoped
 * to one mission's tenant and one mission's allowed tool set, and nothing
 * else. Compact, self-contained format (no JWT library dependency,
 * matching this codebase's existing raw-HMAC pattern in
 * lib/social/webhook-signature.ts and packages/*'s razorpay/whatsapp
 * webhook verifiers) — base64url(JSON payload).base64url(signature).
 */
export function issueMissionToken(input: {
  missionId: string;
  tenantId: string;
  allowedTools: ToolName[];
  ttlMs?: number;
}): string {
  const now = Date.now();
  const payload: MissionTokenPayload = {
    missionId: input.missionId,
    tenantId: input.tenantId,
    allowedTools: input.allowedTools,
    issuedAtMs: now,
    expiresAtMs: now + (input.ttlMs ?? DEFAULT_TTL_MS),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signPayload(encodedPayload, getSecret());
  return `${encodedPayload}.${signature}`;
}

export type VerifyMissionTokenResult =
  | { ok: true; payload: MissionTokenPayload }
  | { ok: false; reason: "malformed" | "invalid_signature" | "expired" };

export function verifyMissionToken(token: string): VerifyMissionTokenResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [encodedPayload, signature] = parts;

  if (!verifySignature(encodedPayload, signature, getSecret())) {
    return { ok: false, reason: "invalid_signature" };
  }

  let payload: MissionTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (Date.now() > payload.expiresAtMs) return { ok: false, reason: "expired" };

  return { ok: true, payload };
}

export function isToolAllowed(payload: MissionTokenPayload, tool: ToolName): boolean {
  return payload.allowedTools.includes(tool);
}
