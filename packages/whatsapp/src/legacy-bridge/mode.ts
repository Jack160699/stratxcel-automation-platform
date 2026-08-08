export type WhatsAppMigrationMode = "off" | "shadow" | "cutover";

const VALID_MODES: readonly WhatsAppMigrationMode[] = ["off", "shadow", "cutover"];

/**
 * Server-only, centralized. No client input ever reaches this — it reads
 * one environment variable and nothing else. Default is "shadow" per the
 * task brief, but this flag is NOT what makes shadow mode safe: the actual
 * zero-send guarantee is enforced unconditionally in
 * lib/whatsapp/send-outbound.ts by checking the phone binding's `source`
 * column, independent of this mode value. Setting WHATSAPP_MIGRATION_MODE
 * to "cutover" this task has NO additional effect anywhere in this
 * codebase — no code path reads "cutover" to unlock a new capability. A
 * real cutover requires a future, separate, explicit code change.
 */
export function getWhatsAppMigrationMode(): WhatsAppMigrationMode {
  const raw = process.env.WHATSAPP_MIGRATION_MODE;
  if (raw && VALID_MODES.includes(raw as WhatsAppMigrationMode)) return raw as WhatsAppMigrationMode;
  return "shadow";
}
