// Central guard against model-fabricated database identifiers reaching
// Postgres. Every Agent tool argument that names a row by primary key
// (accountId, variantId, masterId, campaignId, assetId, attachmentId,
// publishingJobId, id, ...) must pass through here before it reaches a
// Supabase `.eq("id", …)` filter.
//
// The model is never the source of truth for internal IDs — it must obtain
// them from a trusted tool result (list/inspect/create) or from server-
// injected context (e.g. attachment IDs, see orchestrator.ts). Rejecting an
// obviously-invalid value here produces a normal, retryable tool-error
// message the model can recover from ("look it up first"), instead of a raw
// `invalid input syntax for type uuid: "..."` Postgres failure reaching the
// user, or — worse — a semantically wrong row being matched.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function requireUuid(value: unknown, field: string): string {
  if (!isUuid(value)) {
    const shown = typeof value === "string" && value.trim() ? value : "(missing)";
    throw new Error(
      `${field} must be a real ID returned by a tool (e.g. list_campaigns, list_content, inspect_accounts, or a prior create_* result) — ` +
        `"${shown}" is not a valid ID. Look it up first, then pass the exact ID. Never invent one.`
    );
  }
  return value;
}

/** For optional relationship fields (e.g. campaignId): absent/empty stays null; anything present must be a real UUID. */
export function optionalUuid(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  return requireUuid(value, field);
}
