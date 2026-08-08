import { createLead, findLeadByNormalizedPhone } from "@stratxcel/leads-and-crm";
import type { ServiceClient } from "../db.ts";
import { normalizePhoneNumber } from "../phone-normalize.ts";

/**
 * Backfill/import contract for legacy history (section 16 of the task
 * brief). This is finished and callable, but NOT executed against real
 * data this task — the legacy bot's Supabase project credentials were not
 * available (only the env VAR NAMES are documented in the old repo's
 * .env.example; no values were obtainable, and none should be requested
 * or handled here). A caller who does have read access to the legacy
 * project's exported rows can pass them through this function; it is
 * idempotent (safe to rerun) via the whatsapp_migration_imports dedupe
 * table, and imports only the fields explicitly listed below — no
 * sensitive/irrelevant legacy fields are pulled in by default.
 */
export interface LegacyContactImportRow {
  sourceRecordId: string; // legacy contact/lead primary key or phone, as a stable string
  contactPhone: string;
  contactName?: string | null;
  leadStage?: string | null; // informational only — stored in metadata, not force-mapped onto LeadStatus
  createdAt?: string | null;
}

export interface ImportOutcome {
  imported: number;
  skippedAlreadyImported: number;
  errors: Array<{ sourceRecordId: string; error: string }>;
}

export async function importLegacyContacts(supabase: ServiceClient, tenantId: string, rows: LegacyContactImportRow[]): Promise<ImportOutcome> {
  const outcome: ImportOutcome = { imported: 0, skippedAlreadyImported: 0, errors: [] };

  for (const row of rows) {
    try {
      const { data: existingImport } = await supabase
        .from("whatsapp_migration_imports")
        .select("id")
        .eq("source_system", "legacy_verified_bot")
        .eq("source_record_type", "contact")
        .eq("source_record_id", row.sourceRecordId)
        .maybeSingle();
      if (existingImport) {
        outcome.skippedAlreadyImported += 1;
        continue;
      }

      const normalizedPhone = normalizePhoneNumber(row.contactPhone);
      let lead = normalizedPhone ? await findLeadByNormalizedPhone(supabase, tenantId, normalizedPhone) : null;
      if (!lead) {
        lead = await createLead(supabase, {
          tenantId,
          source: "import",
          contactName: row.contactName ?? null,
          contactPhone: row.contactPhone,
          normalizedPhone,
          metadata: { origin: "legacy_verified_bot_backfill", legacy_lead_stage: row.leadStage ?? null, legacy_created_at: row.createdAt ?? null },
        });
      }

      const { error: importError } = await supabase.from("whatsapp_migration_imports").insert({
        tenant_id: tenantId,
        source_system: "legacy_verified_bot",
        source_record_type: "contact",
        source_record_id: row.sourceRecordId,
        target_table: "crm_leads",
        target_record_id: lead.id,
      });
      if (importError) throw new Error(importError.message);
      outcome.imported += 1;
    } catch (err) {
      outcome.errors.push({ sourceRecordId: row.sourceRecordId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return outcome;
}
