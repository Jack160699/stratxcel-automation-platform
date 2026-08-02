export type BillingMode = "customer_owned" | "stratxcel_managed" | "hybrid";
export type ValidationStatus = "pending" | "valid" | "invalid" | "revoked";

export interface ProviderCapabilities {
  text?: boolean;
  vision?: boolean;
  image?: boolean;
  video?: boolean;
  speech?: boolean;
  search?: boolean;
}

export interface ProviderDefinition {
  key: string;
  label: string;
  capabilities: ProviderCapabilities;
  /** Format hint only, for the connect-form UI — never used to validate a real key against the provider. */
  keyFormatHint: string;
}

export interface TenantProviderConnectionRow {
  id: string;
  tenant_id: string;
  provider_key: string;
  billing_mode: BillingMode;
  validation_status: ValidationStatus;
  encrypted_secret_ref: string | null;
  capabilities: ProviderCapabilities;
  monthly_limit_cents: number | null;
  per_mission_limit_cents: number | null;
  fallback_policy: Record<string, unknown>;
  last_validated_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderUsageEventRow {
  id: string;
  tenant_id: string;
  provider_key: string;
  mission_id: string | null;
  capability: string;
  units: number;
  cost_cents: number;
  metadata: Record<string, unknown>;
  created_at: string;
}
