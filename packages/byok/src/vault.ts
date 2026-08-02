import crypto from "node:crypto";
import type { ServiceClient } from "./db.ts";

/**
 * Abstraction over "where encrypted secrets actually live" so
 * DevEncryptedVaultAdapter (this file) can be swapped for a real cloud
 * secret manager (AWS Secrets Manager, GCP Secret Manager, HashiCorp
 * Vault, an enterprise customer's own vault) later without changing any
 * caller — every caller only ever sees an opaque `ref` string, never the
 * secret itself, except via retrieve() which is reserved for the one
 * place that actually needs the plaintext at call time (e.g. the
 * WhatsApp/Razorpay live-mode adapters, once those exist for real).
 */
export interface SecretVault {
  store(plaintext: string): Promise<string>;
  retrieve(ref: string): Promise<string | null>;
  revoke(ref: string): Promise<void>;
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export function getEncryptionKeyFromEnv(): Buffer {
  const key = process.env.BYOK_VAULT_ENCRYPTION_KEY;
  if (!key) throw new Error("BYOK_VAULT_ENCRYPTION_KEY is not set — required to store or retrieve vaulted secrets");
  return parseEncryptionKey(key);
}

export function parseEncryptionKey(hexKey: string): Buffer {
  const buf = Buffer.from(hexKey, "hex");
  if (buf.length !== 32) throw new Error("Encryption key must be a 32-byte (64 hex character) key for AES-256-GCM");
  return buf;
}

/** Pure — no I/O — so it's unit-testable without a database or env var. */
export function encryptSecret(plaintext: string, key: Buffer): EncryptedPayload {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), authTag: authTag.toString("base64") };
}

/** Pure — throws if the auth tag doesn't verify (tampered or wrong key). */
export function decryptSecret(payload: EncryptedPayload, key: Buffer): string {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}

/**
 * Development-grade vault: AES-256-GCM, ciphertext stored in
 * vault_secrets (never in an application-readable table, never returned
 * to a browser by any route in this codebase). The application MUST
 * never return a saved secret to the browser after creation — this
 * adapter's retrieve() is deliberately not exposed by any API route;
 * only server-side adapter code (WhatsApp/Razorpay live-mode branches)
 * would ever call it, and only once those are actually wired to use
 * per-tenant keys instead of platform-wide env vars.
 */
export function createDevEncryptedVault(supabase: ServiceClient): SecretVault {
  return {
    async store(plaintext: string): Promise<string> {
      const encrypted = encryptSecret(plaintext, getEncryptionKeyFromEnv());
      const { data, error } = await supabase
        .from("vault_secrets")
        .insert({ ciphertext: encrypted.ciphertext, iv: encrypted.iv, auth_tag: encrypted.authTag })
        .select("id")
        .single();
      if (error) throw new Error(`vault store failed: ${error.message}`);
      return data.id as string;
    },

    async retrieve(ref: string): Promise<string | null> {
      const { data, error } = await supabase.from("vault_secrets").select("*").eq("id", ref).maybeSingle();
      if (error) throw new Error(`vault retrieve failed: ${error.message}`);
      if (!data) return null;
      return decryptSecret({ ciphertext: data.ciphertext, iv: data.iv, authTag: data.auth_tag }, getEncryptionKeyFromEnv());
    },

    async revoke(ref: string): Promise<void> {
      const { error } = await supabase.from("vault_secrets").delete().eq("id", ref);
      if (error) throw new Error(`vault revoke failed: ${error.message}`);
    },
  };
}
