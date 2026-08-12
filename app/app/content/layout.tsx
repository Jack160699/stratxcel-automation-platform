import { redirect } from "next/navigation";

/**
 * Customer Content is intentionally unavailable in V1. The existing pages
 * are staff-scoped Social concepts and must not be exposed as a tenant-owned
 * customer module until their storage and APIs enforce tenant isolation.
 */
export default function CustomerContentUnavailableLayout() {
  redirect("/app");
}
