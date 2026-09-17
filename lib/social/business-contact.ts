import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhoneNumber } from "./contact-numbers.ts";

/**
 * A tenant's canonical contact identity for social copy, read only from the
 * owner-edited Brand Brain (My Shop): business_name, website_url,
 * business_phone and business_whatsapp. Nothing is defaulted or guessed -- a
 * field that isn't configured is null, and copy must then not mention it.
 */
export interface BusinessContactProfile {
  businessName: string | null;
  websiteUrl: string | null;
  /** Number for calls (Brand Brain business_phone). */
  callNumber: string | null;
  /** Number for WhatsApp: business_whatsapp when set, otherwise the business phone. */
  whatsappNumber: string | null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function httpUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function resolveBusinessContact(content: Record<string, unknown> | null | undefined): BusinessContactProfile {
  const c = content ?? {};
  const callNumber = normalizePhoneNumber(text(c.business_phone));
  return {
    businessName: text(c.business_name),
    websiteUrl: httpUrl(c.website_url),
    callNumber,
    whatsappNumber: normalizePhoneNumber(text(c.business_whatsapp)) ?? callNumber,
  };
}

/** Every number the tenant has actually configured; anything else in copy is unverified. */
export function canonicalContactNumbers(contact: BusinessContactProfile | null | undefined): string[] {
  if (!contact) return [];
  return [...new Set([contact.callNumber, contact.whatsappNumber].filter((n): n is string => Boolean(n)))];
}

/** Current Brand Brain version for a tenant -> its contact profile. Null when the tenant has no Brand Brain. */
export async function loadTenantBusinessContact(service: SupabaseClient, tenantId: string): Promise<BusinessContactProfile | null> {
  const { data: brain, error } = await service.from("brand_brains").select("current_version").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`Failed to load Brand Brain: ${error.message}`);
  if (!brain) return null;
  const { data: version, error: vErr } = await service
    .from("brand_brain_versions")
    .select("content")
    .eq("tenant_id", tenantId)
    .eq("version", brain.current_version)
    .maybeSingle();
  if (vErr) throw new Error(`Failed to load Brand Brain version: ${vErr.message}`);
  return version ? resolveBusinessContact(version.content as Record<string, unknown>) : null;
}
