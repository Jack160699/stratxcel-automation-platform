export type LeadSource = "whatsapp" | "website_form" | "manual" | "import";
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
  created_at: string;
  updated_at: string;
}
