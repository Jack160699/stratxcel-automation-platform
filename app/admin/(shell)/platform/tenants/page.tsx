import { redirect } from "next/navigation";

/** Compatibility wrapper — renamed to /admin/clients (ADMIN_INFORMATION_ARCHITECTURE.md §1). */
export default function LegacyTenantsRedirect() {
  redirect("/admin/clients");
}
