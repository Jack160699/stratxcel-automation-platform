"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { trackFunnel } from "@/lib/analytics/events";

interface PublicPaymentStatus {
  referenceId: string;
  amountCents: number;
  currency: string;
  status: "created" | "paid" | "partially_paid" | "expired" | "cancelled";
  description: string | null;
  shortUrl: string | null;
  mode: "test" | "live";
  paymentPurpose?: string;
  signatureVerified: boolean;
  verificationPending: boolean;
  createdAt: string;
}

function StatusContent() {
  const searchParams = useSearchParams();
  const linkId = searchParams.get("link_id") || searchParams.get("reference_id") || searchParams.get("id");
  const rzpPaymentId = searchParams.get("razorpay_payment_id");

  const [payment, setPayment] = useState<PublicPaymentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!linkId) {
      setError("No payment reference specified in URL.");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const queryStr = window.location.search;
        const res = await fetch(`/api/platform/payments/status${queryStr}`);
        const body = await res.json();
        if (!res.ok) {
          setError(body.error ?? "Failed to load payment status");
          return;
        }
        setPayment(body);
        if (body.status === "paid" && body.paymentPurpose === "audit_fee") {
          trackFunnel("audit_payment_confirmed", { surface: "payment_status" });
        }
      } catch {
        setError("Network error fetching payment status");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [linkId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-400">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center">
          <p className="text-sm font-medium">Checking payment status…</p>
        </div>
      </div>
    );
  }

  if (error || !payment) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center">
          <h1 className="text-xl font-semibold text-rose-400">Payment Not Found</h1>
          <p className="mt-2 text-sm text-slate-400">{error ?? "Unable to locate this payment record."}</p>
        </div>
      </div>
    );
  }

  const isPaid = payment.status === "paid";
  const isCancelled = payment.status === "cancelled";
  const isExpired = payment.status === "expired";
  const isPending = payment.status === "created" || payment.verificationPending;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-slate-100">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-sm">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4">
            {isPaid && (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
            {isPending && (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <svg className="h-8 w-8 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m0 14v1m8-8h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
                </svg>
              </div>
            )}
            {(isCancelled || isExpired) && (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            )}
          </div>

          <h1 className="text-2xl font-bold text-slate-100">
            {isPaid ? "Payment Successful" : isCancelled ? "Payment Cancelled" : isExpired ? "Payment Expired" : "Verification Pending"}
          </h1>

          <p className="mt-1 text-sm text-slate-400">
            {payment.description || "Stratxcel Platform Payment"}
          </p>

          <div className="mt-6 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-5 text-left">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <span className="text-sm text-slate-400">Amount</span>
              <span className="text-xl font-bold text-slate-100">
                {payment.currency} {(payment.amountCents / 100).toFixed(2)}
              </span>
            </div>

            <div className="flex justify-between items-center py-3 border-b border-slate-800">
              <span className="text-sm text-slate-400">Reference ID</span>
              <span className="font-mono text-xs text-slate-300">{payment.referenceId}</span>
            </div>

            <div className="flex justify-between items-center pt-3">
              <span className="text-sm text-slate-400">Status</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${
                  isPaid
                    ? "bg-emerald-400/15 text-emerald-300"
                    : isPending
                    ? "bg-amber-400/15 text-amber-300"
                    : "bg-rose-400/15 text-rose-300"
                }`}
              >
                {payment.status}
              </span>
            </div>
          </div>

          {payment.verificationPending && (
            <p className="mt-4 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              Your payment is being confirmed asynchronously. Once processed, your receipt and account status will automatically reflect the payment.
            </p>
          )}

          {rzpPaymentId && (
            <p className="mt-3 font-mono text-xs text-slate-500">
              Razorpay Payment ID: {rzpPaymentId}
            </p>
          )}

          {isPaid && payment.paymentPurpose === "audit_fee" && (
            <Link
              href="/app/audit"
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-500 px-6 font-semibold text-slate-950 hover:bg-emerald-400"
            >
              Continue to your Audit →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PaymentStatusPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">Loading payment page…</div>}>
      <StatusContent />
    </Suspense>
  );
}
