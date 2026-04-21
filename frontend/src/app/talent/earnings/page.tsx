"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getEarnings, listPayouts, requestPayout } from "@/lib/api";

interface Payout {
  id: number;
  amount: number | string;
  currency: string;
  status: string;
  bank_account_ref: string | null;
  notes: string | null;
  created_at: string;
  completed_at?: string | null;
}

interface Earnings {
  gross_revenue: number;
  total_earned: number;
  paid_out: number;
  pending_payout: number;
  available_balance: number;
}

const STATUS_BADGE: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  requested:  { label: "Pending review",  color: "bg-yellow-50 text-yellow-700",  icon: <Clock className="w-3 h-3" /> },
  processing: { label: "Processing",      color: "bg-blue-50 text-blue-700",      icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  paid:       { label: "Paid",            color: "bg-green-50 text-green-700",    icon: <CheckCircle className="w-3 h-3" /> },
  rejected:   { label: "Rejected",        color: "bg-red-50 text-red-700",        icon: <XCircle className="w-3 h-3" /> },
  cancelled:  { label: "Cancelled",       color: "bg-gray-100 text-gray-600",     icon: <XCircle className="w-3 h-3" /> },
};

export default function TalentEarningsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRequest, setShowRequest] = useState(false);
  const [amount, setAmount] = useState("");
  const [bankRef, setBankRef] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "talent")) {
      router.push("/login");
      return;
    }
    if (user) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [e, p] = await Promise.all([getEarnings(), listPayouts()]);
      setEarnings(e);
      setPayouts(p as Payout[]);
    } catch (err) {
      console.error("Failed to load earnings:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      setFormError("Enter a valid amount");
      return;
    }
    if (earnings && amt > earnings.available_balance) {
      setFormError(`Amount exceeds available balance (£${earnings.available_balance.toLocaleString()})`);
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await requestPayout({
        amount: amt,
        bank_account_ref: bankRef || undefined,
        notes: notes || undefined,
      });
      setAmount("");
      setBankRef("");
      setNotes("");
      setShowRequest(false);
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Payout request failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-black border-t-transparent" />
      </div>
    );
  }

  const balance = earnings?.available_balance ?? 0;
  const canRequest = balance > 0;

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 bg-black text-white flex items-center justify-center text-xs font-bold">FL</div>
            <span className="font-semibold text-base tracking-wide">FACE LIBRARY</span>
          </Link>
          <Link
            href="/talent/dashboard"
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-black"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">Earnings &amp; Payouts</h1>
          <p className="text-gray-600">
            Track your licensed-campaign earnings and request payouts.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Earned</p>
            <p className="text-2xl font-bold">£{(earnings?.total_earned ?? 0).toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-1">90% of gross £{(earnings?.gross_revenue ?? 0).toLocaleString()}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Paid out</p>
            <p className="text-2xl font-bold">£{(earnings?.paid_out ?? 0).toLocaleString()}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Pending</p>
            <p className="text-2xl font-bold">£{(earnings?.pending_payout ?? 0).toLocaleString()}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-6">
            <p className="text-xs text-green-700 uppercase tracking-wider mb-1">Available</p>
            <p className="text-2xl font-bold text-green-700">£{balance.toLocaleString()}</p>
          </div>
        </div>

        <div className="mb-10">
          <button
            onClick={() => setShowRequest((s) => !s)}
            disabled={!canRequest}
            className="inline-flex items-center gap-2 bg-black text-white px-5 py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            {showRequest ? "Cancel" : "Request Payout"}
          </button>
          {!canRequest && (
            <p className="text-xs text-gray-500 mt-2">
              No balance available. Earnings appear here after brand payments clear.
            </p>
          )}
        </div>

        {showRequest && (
          <form
            onSubmit={handleRequest}
            className="bg-white border border-gray-200 rounded-xl p-6 mb-10 max-w-2xl"
          >
            <h2 className="text-lg font-semibold mb-4">New Payout Request</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Amount (GBP)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={balance}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Max available: £{balance.toLocaleString()}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Bank account reference <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={bankRef}
                  onChange={(e) => setBankRef(e.target.value)}
                  placeholder="e.g. HSBC **** 1234"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Notes <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none"
                />
              </div>
              {formError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                  {formError}
                </div>
              )}
              <div className="text-xs text-gray-500 leading-relaxed bg-gray-50 border border-gray-200 rounded-lg p-3">
                Stripe Connect integration for automated transfers is not yet
                enabled. Requests are reviewed by platform operators and paid
                manually — typical turnaround is 3-5 business days.
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-black text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit Payout Request"}
              </button>
            </div>
          </form>
        )}

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-base font-semibold">Payout History</h2>
          </div>
          {payouts.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-500">
              No payout requests yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left font-semibold text-gray-700 px-6 py-3">Date</th>
                  <th className="text-right font-semibold text-gray-700 px-6 py-3">Amount</th>
                  <th className="text-left font-semibold text-gray-700 px-6 py-3">Bank</th>
                  <th className="text-left font-semibold text-gray-700 px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => {
                  const badge = STATUS_BADGE[p.status] ?? STATUS_BADGE.requested;
                  const amt = typeof p.amount === "string" ? parseFloat(p.amount) : p.amount;
                  return (
                    <tr key={p.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-6 py-4 text-gray-600">
                        {new Date(p.created_at).toLocaleDateString("en-GB", {
                          day: "2-digit", month: "short", year: "numeric",
                        })}
                      </td>
                      <td className="px-6 py-4 text-right font-medium">
                        £{amt.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {p.bank_account_ref || "—"}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${badge.color}`}>
                          {badge.icon}
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
