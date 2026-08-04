"use client";

import { useEffect, useState, useCallback } from "react";
import { useTenantId } from "../useTenantId";
import { TenantIdBar } from "../TenantIdBar";

interface PaymentLinkItem {
  id: string;
  tenant_id: string;
  provider: string;
  provider_link_id: string | null;
  reference_id: string;
  amount_cents: number;
  currency: string;
  status: "created" | "paid" | "partially_paid" | "expired" | "cancelled";
  mode: "test" | "live";
  short_url: string | null;
  description: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  expire_by: string | null;
  created_at: string;
}

const STATUS_BADGES: Record<string, string> = {
  created: "bg-amber-400/15 text-amber-300 border-amber-500/20",
  paid: "bg-emerald-400/15 text-emerald-300 border-emerald-500/20",
  partially_paid: "bg-sky-400/15 text-sky-300 border-sky-500/20",
  expired: "bg-slate-600/20 text-slate-400 border-slate-700/30",
  cancelled: "bg-rose-400/15 text-rose-300 border-rose-500/20",
};

export default function PaymentsPage() {
  const [tenantId, setTenantId] = useTenantId();
  const [links, setLinks] = useState<PaymentLinkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form state
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [expireBy, setExpireBy] = useState("");

  const loadLinks = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/payments/links?tenantId=${encodeURIComponent(tenantId)}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Failed to load payment links (HTTP ${res.status})`);
        return;
      }
      setLinks(body.links ?? []);
    } catch {
      setError("Network error fetching payment links");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) {
      setError("Please specify a Tenant ID above");
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError("Please enter a valid amount in INR");
      return;
    }

    setCreating(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch("/api/platform/payments/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          amountInRupees: numAmount,
          description: description.trim() || undefined,
          customerName: customerName.trim() || undefined,
          customerEmail: customerEmail.trim() || undefined,
          customerPhone: customerPhone.trim() || undefined,
          expireBy: expireBy ? new Date(expireBy).toISOString() : undefined,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Failed to create payment link");
        return;
      }

      setSuccessMsg(`Payment link created successfully (${body.link.reference_id})`);
      setAmount("");
      setDescription("");
      setCustomerName("");
      setCustomerEmail("");
      setCustomerPhone("");
      setExpireBy("");
      await loadLinks();
    } catch {
      setError("Network error creating payment link");
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = async (linkId: string) => {
    if (!tenantId) return;
    if (!confirm("Are you sure you want to cancel this payment link?")) return;

    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/platform/payments/links/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, linkId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Failed to cancel payment link");
        return;
      }
      setSuccessMsg("Payment link cancelled");
      await loadLinks();
    } catch {
      setError("Network error cancelling payment link");
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="flex flex-col gap-6">
      <TenantIdBar tenantId={tenantId} onChange={setTenantId} />

      {/* Integration posture header */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Razorpay Payment Integration</h2>
            <p className="mt-1 text-xs text-slate-400">
              Standard Payment Links flow. Generates server-validated INR links stored in Supabase with webhook reconciliation.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Posture:</span>
            <span className="rounded-full bg-slate-800 border border-slate-700 px-3 py-1 text-xs font-mono text-slate-200">
              Server API Ready
            </span>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
          {successMsg}
        </div>
      )}

      {!tenantId ? (
        <p className="text-sm text-slate-500">Set a tenant ID above to manage payment links.</p>
      ) : (
        <>
          {/* Create Payment Link Form */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
            <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-4">
              Create New Payment Link
            </h3>

            <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Amount (INR ₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  placeholder="e.g. 1500.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Description / Quotation Ref
                </label>
                <input
                  type="text"
                  placeholder="e.g. Invoice #INV-2026-001"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Customer Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Customer Email (Optional)
                </label>
                <input
                  type="email"
                  placeholder="e.g. client@example.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Customer Phone (Optional)
                </label>
                <input
                  type="tel"
                  placeholder="e.g. +919876543210"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Expiry Date (Optional)
                </label>
                <input
                  type="datetime-local"
                  value={expireBy}
                  onChange={(e) => setExpireBy(e.target.value)}
                  className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2 pt-2">
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                >
                  {creating ? "Generating Link…" : "Generate Payment Link"}
                </button>
              </div>
            </form>
          </section>

          {/* Payment Links List */}
          <section className="flex flex-col gap-3">
            <h3 className="text-base font-semibold text-slate-200">
              Payment Links ({links.length})
            </h3>

            {loading ? (
              <p className="text-sm text-slate-500">Loading links…</p>
            ) : links.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-center text-sm text-slate-500">
                No payment links found for this tenant. Create one above to get started.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="border-b border-slate-800 bg-slate-950/60 text-xs uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Reference / Razorpay ID</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Customer / Desc</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {links.map((link) => {
                      const shareUrl = link.short_url || `/payment/status?link_id=${link.reference_id}`;
                      const isCancelable = link.status === "created";

                      return (
                        <tr key={link.id} className="hover:bg-slate-900/60 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs">
                            <div className="font-medium text-slate-100">{link.reference_id}</div>
                            {link.provider_link_id && (
                              <div className="text-slate-500 text-[11px]">{link.provider_link_id}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-100">
                            {link.currency} {(link.amount_cents / 100).toFixed(2)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-slate-200">{link.customer_name || link.customer_email || link.customer_phone || "—"}</div>
                            {link.description && <div className="text-xs text-slate-400">{link.description}</div>}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${
                                STATUS_BADGES[link.status] ?? "bg-slate-800 text-slate-300"
                              }`}
                            >
                              {link.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400">
                            {new Date(link.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => copyToClipboard(window.location.origin + (link.short_url ? "" : "/payment/status?link_id=" + link.reference_id) + (link.short_url || ""), link.id)}
                                className="rounded px-2 py-1 text-xs bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
                              >
                                {copiedId === link.id ? "Copied!" : "Copy"}
                              </button>
                              <a
                                href={link.short_url || `/payment/status?link_id=${link.reference_id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded px-2 py-1 text-xs bg-blue-900/40 text-blue-300 border border-blue-800/40 hover:bg-blue-800/40 transition-colors"
                              >
                                Open
                              </a>
                              {isCancelable && (
                                <button
                                  onClick={() => handleCancel(link.id)}
                                  className="rounded px-2 py-1 text-xs bg-rose-900/30 text-rose-300 border border-rose-800/30 hover:bg-rose-800/40 transition-colors"
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
