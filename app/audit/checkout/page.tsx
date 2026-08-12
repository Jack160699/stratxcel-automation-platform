import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CheckoutRedirect } from "./CheckoutRedirect";
import { GuestCheckoutForm } from "./GuestCheckoutForm";

export const dynamic = "force-dynamic";

/**
 * The step between "Pay ₹999" and Razorpay's hosted checkout — never a
 * Stratxcel login/signup wall. A signed-in customer skips straight to
 * payment (unchanged: CheckoutRedirect calls the checkout API immediately).
 * Everyone else sees GuestCheckoutForm: email plus optional GST-invoice
 * details, nothing about their business. Account creation happens after
 * payment, when they claim the purchase (/audit/access).
 */
export default async function AuditCheckoutGatePage() {
  // Keep the public checkout entry usable when auth configuration has not
  // reached an environment yet. The payment API still fails closed behind
  // PAYMENTS_AUDIT_ENABLED, but the customer gets the guest form and its
  // actionable availability message instead of a Server Component crash.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <GuestCheckoutForm />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? <CheckoutRedirect /> : <GuestCheckoutForm />;
}
