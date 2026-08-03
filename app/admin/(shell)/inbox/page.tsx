import { redirect } from "next/navigation";

/** Compatibility wrapper — renamed to /admin/leads (ADMIN_INFORMATION_ARCHITECTURE.md §1). */
export default function LegacyInboxRedirect() {
  redirect("/admin/leads");
}
