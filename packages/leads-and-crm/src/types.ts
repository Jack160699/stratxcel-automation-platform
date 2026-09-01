/** "whatsapp_outreach" = the Boss/staff WhatsApp Agent proactively contacted
 *  this external party (sales/partnership/outreach/follow_up/explainer/hr) —
 *  distinct from "whatsapp" (an inbound customer/prospect who messaged in
 *  first). See crm_leads_source_check (20260901180000_crm_leads_allow_whatsapp_outreach_source.sql). */
export type LeadSource = "whatsapp" | "website_form" | "manual" | "import" | "whatsapp_outreach";
export type LeadStatus = "NEW" | "CONTACTED" | "QUALIFIED" | "WON" | "LOST";

export interface LeadRow {
  id: string;
  tenant_id: string;
  source: LeadSource;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  status: LeadStatus;
  metadata: Record<string, unknown>;
  tags: string[];
  assigned_to: string | null;
  last_interaction_at: string | null;
  next_follow_up_at: string | null;
  notes: string | null;
  normalized_phone: string | null;
  created_at: string;
  updated_at: string;
}
