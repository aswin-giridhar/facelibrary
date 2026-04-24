"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CreditCard, Shield, CheckCircle, Clock, XCircle, Loader2, LogOut, User } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  getBankDetails,
  updateBankDetails,
  getAgentRequests,
  type BankDetails,
} from "@/lib/api";

interface AgentLicenseSummary {
  id: number;
  status: string;
  proposed_price: number | string | null;
  brand_name?: string | null;
  talent_name?: string | null;
  created_at: string;
}

const STATUS_BADGE: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  paid:       { label: "Paid",       color: "bg-green-50 text-green-700",  icon: <CheckCircle className="w-3 h-3" /> },
  pending:    { label: "Pending",    color: "bg-yellow-50 text-yellow-700", icon: <Clock className="w-3 h-3" /> },
  processing: { label: "Processing", color: "bg-blue-50 text-blue-700",    icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  rejected:   { label: "Rejected",   color: "bg-red-50 text-red-700",      icon: <XCircle className="w-3 h-3" /> },
};

const COMMISSION_RATE = 0.10; // Agent keeps 10% (platform + agent split per contract).

const NAV_TABS = [
  { label: "Dashboard", href: "/agent/dashboard" },
  { label: "Talents", href: "/agent/talents" },
  { label: "Licenses", href: "/agent/licenses" },
  { label: "Revenue", href: "/agent/billing" },
  { label: "Messages", href: "/messages" },
];

export default function AgentBillingPage() {
  const { user, logout, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [licenses, setLicenses] = useState<AgentLicenseSummary[]>([]);
  const [bank, setBank] = useState<BankDetails | null>(null);
  const [editingBank, setEditingBank] = useState(false);
  const [bankForm, setBankForm] = useState({
    account_holder_name: "",
    bank_name: "",
    account_number: "",
    sort_code: "",
    iban: "",
    country: "GB",
  });
  const [bankSaving, setBankSaving] = useState(false);
  const [bankError, setBankError] = useState<string | null>(null);
  const [commissionAck, setCommissionAck] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "agent")) {
      router.push("/login");
      return;
    }
    if (user) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [b, reqs] = await Promise.all([
        getBankDetails().catch(() => null),
        user?.profile_id
          ? getAgentRequests(user.profile_id).catch(() => [] as AgentLicenseSummary[])
          : Promise.resolve([] as AgentLicenseSummary[]),
      ]);
      setBank(b);
      setLicenses((reqs as AgentLicenseSummary[]) || []);
    } finally {
      setLoading(false);
    }
  };

  const handleBankSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankForm.account_holder_name.trim()) {
      setBankError("Account holder name is required");
      return;
    }
    setBankError(null);
    setBankSaving(true);
    try {
      await updateBankDetails(bankForm);
      const refreshed = await getBankDetails();
      setBank(refreshed);
      setEditingBank(false);
      setBankForm((f) => ({ ...f, account_number: "" }));
    } catch (err) {
      setBankError(err instanceof Error ? err.message : "Failed to save bank details");
    } finally {
      setBankSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const grossTotal = licenses
    .filter((l) => l.status === "approved" || l.status === "active")
    .reduce((sum, l) => sum + (typeof l.proposed_price === "string" ? parseFloat(l.proposed_price) : (l.proposed_price || 0)), 0);
  const commissionTotal = grossTotal * COMMISSION_RATE;
  const paidLicenses = licenses.filter((l) => l.status === "paid");
  const pendingLicenses = licenses.filter((l) => l.status === "pending" || l.status === "awaiting_approval");
  const paidCommission = paidLicenses.reduce(
    (sum, l) => sum + (typeof l.proposed_price === "string" ? parseFloat(l.proposed_price) : (l.proposed_price || 0)) * COMMISSION_RATE,
    0
  );
  const pendingCommission = pendingLicenses.reduce(
    (sum, l) => sum + (typeof l.proposed_price === "string" ? parseFloat(l.proposed_price) : (l.proposed_price || 0)) * COMMISSION_RATE,
    0
  );

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between h-14">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
                <span className="text-white text-xs font-bold">FL</span>
              </div>
            </Link>
            <div className="hidden md:flex items-center gap-1">
              {NAV_TABS.map((tab) => {
                const isActive = tab.label === "Revenue";
                return (
                  <Link
                    key={tab.label}
                    href={tab.href}
                    className={`px-3 py-4 text-sm transition-colors relative ${
                      isActive ? "text-black font-medium" : "text-gray-500 hover:text-black"
                    }`}
                  >
                    {tab.label}
                    {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-black" />}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-medium text-gray-900">{user?.name || "—"}</span>
            <button onClick={() => { logout(); router.push("/login"); }} className="text-gray-400 hover:text-gray-700 ml-1">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/agent/dashboard" className="text-gray-500 hover:text-black inline-flex items-center gap-1 text-sm">
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </Link>
          <span className="h-4 w-px bg-gray-200" />
          <div>
            <h1 className="text-3xl font-semibold">Revenue</h1>
            <p className="text-gray-600 text-sm">
              Agency commissions, bank details, and payout history.
            </p>
          </div>
        </div>

        {/* Earnings & Payout Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Available balance</p>
            <p className="text-2xl font-bold">£{(paidCommission).toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-1">Released on paid licenses</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total commissions</p>
            <p className="text-2xl font-bold">£{commissionTotal.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-1">{Math.round(COMMISSION_RATE * 100)}% of active licenses</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Pending payouts</p>
            <p className="text-2xl font-bold">£{pendingCommission.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-1">Awaiting brand payment</p>
          </div>
        </div>

        {/* Bank Account for Payouts */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-gray-700" />
              <h2 className="text-base font-semibold">🏦 Bank Account for Payouts</h2>
            </div>
            {bank && !editingBank && (
              <button
                onClick={() => setEditingBank(true)}
                className="text-xs text-gray-600 hover:text-black underline"
              >
                Edit
              </button>
            )}
          </div>
          {!editingBank && bank ? (
            <div className="text-sm text-gray-700 space-y-1">
              <div>
                <span className="text-gray-500">Account holder:</span>{" "}
                <span className="font-medium">{bank.account_holder_name}</span>
              </div>
              {bank.bank_name && (
                <div>
                  <span className="text-gray-500">Bank:</span> {bank.bank_name}
                </div>
              )}
              {bank.account_number_last4 && (
                <div>
                  <span className="text-gray-500">Account ending:</span>{" "}
                  ••••{bank.account_number_last4}
                </div>
              )}
              {bank.sort_code && (
                <div>
                  <span className="text-gray-500">Sort code:</span> {bank.sort_code}
                </div>
              )}
              {bank.iban_last4 && (
                <div>
                  <span className="text-gray-500">IBAN ending:</span> ••••{bank.iban_last4}
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleBankSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">
                  Account holder name <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  value={bankForm.account_holder_name}
                  onChange={(e) =>
                    setBankForm((f) => ({ ...f, account_holder_name: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Bank name</label>
                <input
                  value={bankForm.bank_name}
                  onChange={(e) => setBankForm((f) => ({ ...f, bank_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Account number
                  <span className="text-gray-400 font-normal"> (stored as last 4)</span>
                </label>
                <input
                  value={bankForm.account_number}
                  onChange={(e) =>
                    setBankForm((f) => ({ ...f, account_number: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Sort code</label>
                <input
                  value={bankForm.sort_code}
                  onChange={(e) => setBankForm((f) => ({ ...f, sort_code: e.target.value }))}
                  placeholder="00-00-00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium mb-1">
                  IBAN <span className="text-gray-400 font-normal">(for non-UK accounts)</span>
                </label>
                <input
                  value={bankForm.iban}
                  onChange={(e) => setBankForm((f) => ({ ...f, iban: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              {bankError && (
                <div className="md:col-span-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                  {bankError}
                </div>
              )}
              <div className="md:col-span-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3">
                Only the last 4 digits are stored. Full account numbers should be
                tokenized via Stripe Connect before production use.
              </div>
              <div className="md:col-span-2 flex gap-2">
                <button
                  type="submit"
                  disabled={bankSaving}
                  className="bg-black text-white px-5 py-2 rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50"
                >
                  {bankSaving ? "Saving…" : "Save Bank Details"}
                </button>
                {bank && (
                  <button
                    type="button"
                    onClick={() => setEditingBank(false)}
                    className="border border-gray-300 text-gray-700 px-5 py-2 rounded-lg text-sm hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )}
        </div>

        {/* Platform Commission */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-gray-700 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h2 className="text-base font-semibold mb-1">📊 Platform Commission</h2>
              <p className="text-sm text-gray-600 mb-3">
                Face Library retains {Math.round(COMMISSION_RATE * 100)}% of each licensed deal you
                originate. The remainder is split between your talent and your
                agency per the contract you sign on each request.
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={commissionAck}
                  onChange={(e) => setCommissionAck(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-black focus:ring-black"
                />
                I understand the commission terms.
              </label>
              <Link
                href="/terms"
                className="inline-block mt-3 text-xs text-black underline"
              >
                View Full Terms
              </Link>
            </div>
          </div>
        </div>

        {/* Payout History — projected from approved licenses */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-base font-semibold">🧾 Payout History</h2>
          </div>
          {licenses.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-500">
              No approved licenses yet. Payouts will appear here as brand deals
              clear.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left font-semibold text-gray-700 px-6 py-3">Date</th>
                  <th className="text-left font-semibold text-gray-700 px-6 py-3">Campaign</th>
                  <th className="text-right font-semibold text-gray-700 px-6 py-3">Commission</th>
                  <th className="text-left font-semibold text-gray-700 px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {licenses.slice(0, 20).map((l) => {
                  const statusKey = l.status === "approved" || l.status === "active"
                    ? "paid"
                    : l.status === "pending" || l.status === "awaiting_approval"
                    ? "pending"
                    : l.status;
                  const badge = STATUS_BADGE[statusKey] ?? STATUS_BADGE.pending;
                  const price = typeof l.proposed_price === "string"
                    ? parseFloat(l.proposed_price)
                    : (l.proposed_price || 0);
                  return (
                    <tr key={l.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-6 py-4 text-gray-600">
                        {new Date(l.created_at).toLocaleDateString("en-GB", {
                          day: "2-digit", month: "short", year: "numeric",
                        })}
                      </td>
                      <td className="px-6 py-4 text-gray-800">
                        {l.talent_name || "Talent"} × {l.brand_name || "Brand"}
                      </td>
                      <td className="px-6 py-4 text-right font-medium">
                        £{(price * COMMISSION_RATE).toLocaleString()}
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
