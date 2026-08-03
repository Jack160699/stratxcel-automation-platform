import { redirect } from "next/navigation";

/** Compatibility wrapper — renamed to /admin/finance (ADMIN_INFORMATION_ARCHITECTURE.md §1). */
export default function LegacyWalletRedirect() {
  redirect("/admin/finance");
}
