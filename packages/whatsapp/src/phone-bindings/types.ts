export type PhoneBindingEnvironment = "test" | "staging" | "production";
export type PhoneBindingStatus = "pending" | "active" | "disabled" | "revoked";

export interface WhatsAppPhoneBindingRow {
  id: string;
  tenant_id: string;
  waba_id: string;
  phone_number_id: string;
  display_phone_number: string | null;
  provider_account_ref: string | null;
  environment: PhoneBindingEnvironment;
  status: PhoneBindingStatus;
  default_language: string;
  timezone: string;
  inbound_enabled: boolean;
  outbound_enabled: boolean;
  shadow_mode: boolean;
  encrypted_credential_ref: string | null;
  created_by: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UnmatchedWhatsAppEventRow {
  id: string;
  phone_number_id: string;
  waba_id: string | null;
  provider_message_id: string | null;
  body_excerpt: string | null;
  body_length: number | null;
  received_at: string;
}
