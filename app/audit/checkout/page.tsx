import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CheckoutRedirect } from "./CheckoutRedirect";
import { GuestCheckoutForm } from "./GuestCheckoutForm";

export const dynamic = "force-dynamic";

/**
 * The step between "Pay ₹999" / "Continue Free" and fulfilment.
 * Signed-in customers see CheckoutRedirect (pay or apply a Go Free code).
 * Guests see GuestCheckoutForm. Complimentary redemption never hits Razorpay.
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
