import { redirect } from "next/navigation";

/** Compatibility wrapper — renamed to /admin/integrations (ADMIN_INFORMATION_ARCHITECTURE.md §1). */
export default function LegacyWhatsAppRedirect() {
  redirect("/admin/integrations");
}
