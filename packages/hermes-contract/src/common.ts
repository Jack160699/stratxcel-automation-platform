import { z } from "zod";

/**
 * Stratxcel tenant identifier. Never a credential — the Stratxcel MCP tool
 * server resolves real credentials server-side by this ID. See
 * docs/hermes/SECRETS_AND_SECURITY.md.
 */
export const TenantId = z.string().min(1);
export type TenantId = z.infer<typeof TenantId>;

/** Stratxcel-generated mission identifier. */
export const MissionId = z.uuid();
export type MissionId = z.infer<typeof MissionId>;

/**
 * Hermes-native run identifier returned by `POST /v1/runs`. Opaque —
 * Hermes does not document a fixed format, so this is not constrained
 * beyond non-empty. See docs/hermes/API_CONTRACT.md.
 */
export const RunId = z.string().min(1);
export type RunId = z.infer<typeof RunId>;

/**
 * Stratxcel-generated key used to de-duplicate mission submission retries.
 * Hermes' own `/v1/runs` surface has no caller-supplied idempotency key;
 * the guarantee is enforced by Stratxcel's integration layer. See
 * docs/hermes/FAILURE_RETRY_IDEMPOTENCY.md.
 */
export const IdempotencyKey = z.string().min(1).max(255);
export type IdempotencyKey = z.infer<typeof IdempotencyKey>;

/** One of the ten Hermes profiles defined in docs/hermes/PROFILE_AND_TOOL_POLICY.md. */
export const ProfileName = z.enum([
  "orchestrator",
  "research",
  "content",
  "social",
  "seo",
  "website-development",
  "crm",
  "proposal",
  "media",
  "operations",
]);
export type ProfileName = z.infer<typeof ProfileName>;

export const IsoTimestamp = z.iso.datetime({ offset: true });
export type IsoTimestamp = z.infer<typeof IsoTimestamp>;

/** SHA-256 hex digest, used to verify artifact retrieval. */
export const Sha256Hex = z.string().regex(/^[0-9a-f]{64}$/i, "must be a hex-encoded SHA-256 digest");
export type Sha256Hex = z.infer<typeof Sha256Hex>;
