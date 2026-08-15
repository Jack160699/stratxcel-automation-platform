import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Free Audit Migration:
 * The old ₹999 checkout step is retired.
 * Visitors to /audit/checkout are redirected directly into the Free Audit flow.
 */
export default async function AuditCheckoutGatePage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    redirect("/app/audit");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/app/audit");
  } else {
    redirect("/signup?next=/app/audit");
  }
}
