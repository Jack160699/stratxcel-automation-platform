import crypto from "node:crypto";
export type WhatsAppSocialOperation = "preview" | "edit" | "approve" | "cancel";
export interface WhatsAppHandoffClaims { v: 1; sub: string; tenant: string | null; session: string; op: WhatsAppSocialOperation; exp: number }
function secret() { const value = process.env.SOCIAL_WHATSAPP_LINK_SECRET || process.env.AGENT_CHANNEL_SHARED_SECRET; if (!value || value.length < 32) throw new Error("Social WhatsApp link signing is not configured"); return value; }
function b64(value: string) { return Buffer.from(value).toString("base64url"); }
function packId(value: string | null) { if (value === null) return null; const hex = value.replaceAll("-", ""); return /^[0-9a-f]{32}$/i.test(hex) ? Buffer.from(hex, "hex").toString("base64url") : value; }
function unpackId(value: string | null) { if (value === null || value.length !== 22) return value; const hex = Buffer.from(value, "base64url").toString("hex"); return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`; }
const opCode: Record<WhatsAppSocialOperation, string> = { preview: "p", edit: "e", approve: "a", cancel: "c" };
const operation: Record<string, WhatsAppSocialOperation> = { p: "preview", e: "edit", a: "approve", c: "cancel" };
export function signWhatsAppSocialHandoff(input: Omit<WhatsAppHandoffClaims, "v" | "exp">, ttlSeconds = 15 * 60) {
  const payload = b64(JSON.stringify({ v: 1, s: packId(input.sub), t: packId(input.tenant), n: packId(input.session), o: opCode[input.op], e: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const signature = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
export function verifyWhatsAppSocialHandoff(token: string, expected?: { sub?: string; operation?: WhatsAppSocialOperation }): WhatsAppHandoffClaims | null {
  const [payload, supplied] = token.split("."); if (!payload || !supplied) return null;
  const valid = crypto.createHmac("sha256", secret()).update(payload).digest(); const actual = Buffer.from(supplied, "base64url");
  if (actual.length !== valid.length || !crypto.timingSafeEqual(actual, valid)) return null;
  try { const c = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { v: 1; s: string; t: string | null; n: string; o: string; e: number }; const claims = { v: c.v, sub: unpackId(c.s)!, tenant: unpackId(c.t), session: unpackId(c.n)!, op: operation[c.o], exp: c.e } satisfies WhatsAppHandoffClaims; if (claims.v !== 1 || !claims.op || claims.exp <= Math.floor(Date.now() / 1000) || !claims.sub || !claims.session || (expected?.sub && claims.sub !== expected.sub) || (expected?.operation && claims.op !== expected.operation)) return null; return claims; } catch { return null; }
}
