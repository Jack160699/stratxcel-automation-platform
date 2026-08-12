import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const STAFF_WORKSPACE_COOKIE = "stratxcel_staff_workspace";
export const STAFF_WORKSPACE_TTL_SECONDS = 15 * 60;

interface StaffWorkspaceClaims {
  subject: string;
  tenantId: string;
  issuedAt: number;
  expiresAt: number;
}

function signingSecret(): string | null {
  return process.env.STAFF_WORKSPACE_COOKIE_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
}

function signature(payload: string): string | null {
  const secret = signingSecret();
  return secret ? createHmac("sha256", secret).update(payload).digest("base64url") : null;
}

export function createStaffWorkspaceToken(input: { subject: string; tenantId: string; now?: number }): string {
  const issuedAt = input.now ?? Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ subject: input.subject, tenantId: input.tenantId, issuedAt, expiresAt: issuedAt + STAFF_WORKSPACE_TTL_SECONDS })
  ).toString("base64url");
  const signed = signature(payload);
  if (!signed) throw new Error("Staff workspace signing secret is not configured");
  return `${payload}.${signed}`;
}

export function verifyStaffWorkspaceToken(token: string, subject: string, now?: number): StaffWorkspaceClaims | null {
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return null;
  const expectedSignature = signature(payload);
  if (!expectedSignature) return null;
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as StaffWorkspaceClaims;
    const currentTime = now ?? Math.floor(Date.now() / 1000);
    if (claims.subject !== subject || !claims.tenantId || claims.issuedAt > currentTime || claims.expiresAt <= currentTime) return null;
    if (claims.expiresAt - claims.issuedAt !== STAFF_WORKSPACE_TTL_SECONDS) return null;
    return claims;
  } catch {
    return null;
  }
}

export async function readStaffWorkspaceTenantId(subject: string): Promise<string | null> {
  const store = await cookies();
  const token = store.get(STAFF_WORKSPACE_COOKIE)?.value;
  return token ? verifyStaffWorkspaceToken(token, subject)?.tenantId ?? null : null;
}

export async function setStaffWorkspaceCookie(subject: string, tenantId: string): Promise<void> {
  const store = await cookies();
  store.set(STAFF_WORKSPACE_COOKIE, createStaffWorkspaceToken({ subject, tenantId }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STAFF_WORKSPACE_TTL_SECONDS,
  });
}

export async function clearStaffWorkspaceCookie(): Promise<void> {
  const store = await cookies();
  store.delete(STAFF_WORKSPACE_COOKIE);
}
