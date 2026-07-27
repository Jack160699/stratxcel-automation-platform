import crypto from "node:crypto";

/**
 * AES-256-GCM encryption for Meta access/refresh tokens at rest.
 * Server-only. Key comes from SOCIAL_TOKEN_ENCRYPTION_KEY — a 32-byte
 * secret, base64-encoded (44 chars). Generate with:
 *   openssl rand -base64 32
 *
 * Ciphertext, IV, and auth tag are stored as separate base64 columns so a
 * DB dump alone (even the whole row) never contains a usable token without
 * the key, which lives only in the server environment.
 */

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "SOCIAL_TOKEN_ENCRYPTION_KEY is not set — required to encrypt/decrypt social tokens"
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "SOCIAL_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (base64 of a 256-bit key)"
    );
  }
  return key;
}

export interface EncryptedField {
  ciphertext: string;
  iv: string;
  tag: string;
}

export function encryptToken(plaintext: string): EncryptedField {
  const key = getKey();
  const iv = crypto.randomBytes(12); // unique per encryption, per GCM spec
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptToken(field: EncryptedField): string {
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(field.iv, "base64"));
  decipher.setAuthTag(Buffer.from(field.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(field.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/**
 * social_tokens (stratxcel schema) stores one text column per token, not
 * three — pack/unpack bridge EncryptedField to that single-column shape.
 * All three segments are base64 (no literal "." in their alphabet), so a
 * plain delimiter is unambiguous and reversible.
 */
export function packEncryptedField(field: EncryptedField): string {
  return `${field.iv}.${field.tag}.${field.ciphertext}`;
}

export function unpackEncryptedField(packed: string): EncryptedField {
  const [iv, tag, ...rest] = packed.split(".");
  if (!iv || !tag || rest.length === 0) {
    throw new Error("malformed packed encrypted field");
  }
  return { iv, tag, ciphertext: rest.join(".") };
}

export function encryptTokenPacked(plaintext: string): string {
  return packEncryptedField(encryptToken(plaintext));
}

export function decryptTokenPacked(packed: string): string {
  return decryptToken(unpackEncryptedField(packed));
}
