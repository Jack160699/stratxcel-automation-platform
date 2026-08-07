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
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? <CheckoutRedirect /> : <GuestCheckoutForm />;
}
