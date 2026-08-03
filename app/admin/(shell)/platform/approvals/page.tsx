import { redirect } from "next/navigation";

/** Compatibility wrapper — renamed to /admin/approvals (ADMIN_INFORMATION_ARCHITECTURE.md §1). */
export default function LegacyApprovalsRedirect() {
  redirect("/admin/approvals");
}
