export type TenantRole = "owner" | "admin" | "operator" | "viewer";

export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface TenantMemberRow {
  tenant_id: string;
  user_id: string;
  role: TenantRole;
  invited_by: string | null;
  created_at: string;
}
