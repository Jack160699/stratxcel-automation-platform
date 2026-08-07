import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CheckoutRedirect } from "./CheckoutRedirect";

export const dynamic = "force-dynamic";

/**
 * The one gate between "Pay ₹999" and Razorpay's hosted checkout. Same
 * pattern the old /audit gate used: an unauthenticated visitor bounces to
 * /login with ?next= pointing right back here, so payment resumes the moment
 * they're signed in — no separate onboarding step is inserted first.
 */
export default async function AuditCheckoutGatePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/audit/checkout");
  }

  return <CheckoutRedirect />;
}
