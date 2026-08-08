import type { TenantRole } from "../tenants/types";

export type Permission =
  | "tenant:invite_member"
  | "tenant:manage_members"
  | "brand_brain:view"
  | "brand_brain:edit"
  | "mission:create"
  | "mission:cancel"
  | "mission:view"
  | "approval:decide"
  | "wallet:view"
  | "wallet:topup"
  | "wallet:spend"
  | "human_handoff:assign"
  | "human_handoff:resolve"
  | "integration:configure"
  | "whatsapp:send"
  | "crm:manage";

export type { TenantRole };
