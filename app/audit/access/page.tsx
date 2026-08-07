import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClaimAndContinue } from "./ClaimAndContinue";
import { ClaimEmailOtpForm } from "./ClaimEmailOtpForm";

export const dynamic = "force-dynamic";

/**
 * Where /payment/status sends a paid customer. Splits on whether they
 * already have a Stratxcel session — a returning customer paying again
 * skips straight through; a guest purchaser proves the email they paid
 * with (Supabase's own OTP) and that becomes their account.
 */
export default async function AuditAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!order) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="font-sx-sans text-sm text-sx-text-muted">Missing order reference.</p>
      </div>
    );
  }

  return user ? <ClaimAndContinue orderId={order} /> : <ClaimEmailOtpForm orderId={order} />;
}
