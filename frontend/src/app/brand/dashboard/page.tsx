/**
 * Brand Dashboard — License request management for advertisers.
 *
 * Features:
 * - Create new license requests (select talent, describe campaign)
 * - Trigger 7-agent pipeline processing on pending requests
 * - View all outgoing requests with status, proposed price, risk score
 * - Expandable request details (negotiation notes, compliance notes, contract)
 *
 * Accessible at: /brand/dashboard (requires brand role)
 */
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Send, Zap, ChevronDown, ChevronUp, Search, CreditCard } from "lucide-react";
import DashboardNav from "@/components/DashboardNav";
import { useAuth } from "@/lib/auth";
import {
  listTalents,
  createLicenseRequest,
  processLicense,
  getBrandRequests,
  getAuditTrail,
  createCheckoutSession,
} from "@/lib/api";

interface TalentListItem {
  id: number;
  name: string;
  bio: string | null;
  categories: string | null;
  min_price_per_use: number;
  geo_scope: string;
  approval_mode: string;
}

interface BrandRequestItem {
  id: number;
  status: string;
  talent_name: string;
  talent_id: number;
  use_case: string;
  content_type: string;
  desired_duration_days: number;
  desired_regions: string | null;
  proposed_price: number | null;
  risk_score: string | null;
  negotiation_notes: string | null;
  compliance_notes: string | null;
  has_contract: boolean;
  payment_status: string | null;
  created_at: string;
}

interface AuditEntry {
  agent_name: string;
  action: string;
  created_at: string;
}

const CATEGORIES = [
  "Fashion", "Beauty", "Technology", "Automotive", "Food & Beverage",
  "Healthcare", "Finance", "Entertainment", "Sports", "Travel",
];

export default function BrandDashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [talents, setTalents] = useState<TalentListItem[]>([]);
  const [requests, setRequests] = useState<BrandRequestItem[]>([]);
  const [logs, setLogs] = useState<Record<number, AuditEntry[]>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Form
  const [talentId, setTalentId] = useState("");
  const [useCase, setUseCase] = useState("");
  const [contentType, setContentType] = useState("image");
  const [duration, setDuration] = useState("30");
  const [regions, setRegions] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [orchestrating, setOrchestrating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [payingId, setPayingId] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "brand")) {
      router.push("/login");
      return;
    }
    if (user?.profile_id) loadData();
  }, [user, authLoading]);

  const loadData = async () => {
    try {
      const [t, r] = await Promise.all([
        listTalents(),
        user?.profile_id ? getBrandRequests(user.profile_id) : Promise.resolve([]),
      ]);
      setTalents(t);
      setRequests(r);
    } catch {
      // error
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.profile_id || !talentId || !useCase) return;
    setSubmitting(true);
    setMessage("");
    try {
      await createLicenseRequest({
        brand_id: user.profile_id,
        talent_id: parseInt(talentId),
        use_case: useCase,
        content_type: contentType,
        desired_duration_days: parseInt(duration),
        desired_regions: regions || undefined,
      });
      setMessage("Request created! Run the orchestrator to process it.");
      setTalentId("");
      setUseCase("");
      setDuration("30");
      setRegions("");
      loadData();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Failed to create request");
    }
    setSubmitting(false);
  };

  const handleOrchestrate = async (id: number) => {
    setOrchestrating(id);
    try {
      await processLicense(id);
      setMessage("Pipeline completed!");
      loadData();
      toggleLogs(id);
    } catch {
      setMessage("Pipeline failed -- check agent logs for details");
    }
    setOrchestrating(null);
  };

  const toggleLogs = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!logs[id]) {
      try {
        const trail = await getAuditTrail(id);
        setLogs((prev) => ({ ...prev, [id]: trail.audit_trail || [] }));
      } catch {
        setLogs((prev) => ({ ...prev, [id]: [] }));
      }
    }
  };

  const handlePay = async (licenseId: number) => {
    setPayingId(licenseId);
    try {
      const result = await createCheckoutSession(licenseId);
      if (result.checkout_url) {
        window.location.href = result.checkout_url;
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Payment failed");
    }
    setPayingId(null);
  };

  if (authLoading) {
    return <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1E3A5F] border-t-transparent" /></div>;
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <DashboardNav />

      <div className="max-w-6xl mx-auto px-8 lg:px-16 py-10">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold text-[#0B0B0F]">Brand Dashboard</h1>
          <p className="font-body text-sm text-[#6B6B73]">Create license requests and run the agent orchestrator</p>
        </div>

        {message && (
          <div className="mb-6 p-3 rounded-md bg-blue-50 border border-blue-200 text-blue-700 font-body text-sm">
            {message}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Create Request */}
          <div className="bg-white border border-[#E0E0DA] rounded-lg p-6">
            <h3 className="font-body text-sm font-medium text-[#0B0B0F] mb-4">Create License Request</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block font-body text-sm text-[#0B0B0F] mb-1">Select Talent *</label>
                <select
                  value={talentId}
                  onChange={(e) => setTalentId(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-[#E0E0DA] rounded-md font-body text-sm bg-white"
                >
                  <option value="">Choose talent...</option>
                  {talents.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-body text-sm text-[#0B0B0F] mb-1">Use Case / Campaign *</label>
                <input
                  type="text"
                  value={useCase}
                  onChange={(e) => setUseCase(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-[#E0E0DA] rounded-md font-body text-sm bg-white"
                  placeholder="e.g. Fashion campaign for summer collection"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-body text-sm text-[#0B0B0F] mb-1">Content Type</label>
                  <select
                    value={contentType}
                    onChange={(e) => setContentType(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E0E0DA] rounded-md font-body text-sm bg-white"
                  >
                    <option value="image">Image</option>
                    <option value="video">Video</option>
                    <option value="both">Both</option>
                  </select>
                </div>
                <div>
                  <label className="block font-body text-sm text-[#0B0B0F] mb-1">Duration (days)</label>
                  <input
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E0E0DA] rounded-md font-body text-sm bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="block font-body text-sm text-[#0B0B0F] mb-1">Regions</label>
                <input
                  type="text"
                  value={regions}
                  onChange={(e) => setRegions(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E0E0DA] rounded-md font-body text-sm bg-white"
                  placeholder="e.g. UK, EU (leave blank for global)"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 bg-[#0B0B0F] text-[#FAFAF8] font-body text-sm font-medium py-2.5 rounded-md hover:bg-[#1E3A5F] transition-colors disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {submitting ? "Submitting..." : "Submit Request"}
              </button>
            </form>
          </div>

          {/* Requests List */}
          <div className="bg-white border border-[#E0E0DA] rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-body text-sm font-medium text-[#0B0B0F]">Your Requests</h3>
              <Link href="/brand/search" className="flex items-center gap-1 font-body text-xs text-[#1E3A5F] hover:underline">
                <Search className="w-3 h-3" /> AI Search
              </Link>
            </div>
            {requests.length === 0 ? (
              <p className="font-body text-sm text-[#6B6B73]">No requests submitted yet.</p>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {requests.map((r) => (
                  <div key={r.id} className="rounded-lg border border-[#E0E0DA] p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-body text-sm font-medium text-[#0B0B0F]">{r.talent_name}</p>
                      <span className={`font-body text-xs px-3 py-1 rounded-full capitalize ${
                        r.status === "active" || r.status === "approved" ? "bg-green-50 text-green-700" :
                        r.status === "rejected" ? "bg-red-50 text-red-700" :
                        r.status === "awaiting_approval" ? "bg-amber-50 text-amber-700" :
                        "bg-[#F5F5F0] text-[#6B6B73]"
                      }`}>
                        {r.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="font-body text-xs text-[#6B6B73] mt-1">
                      {r.use_case}
                    </p>
                    <p className="font-body text-xs text-[#6B6B73]">
                      {r.content_type} &middot; {r.desired_duration_days} days
                    </p>
                    {r.proposed_price != null && (
                      <p className="font-body text-xs text-[#6B6B73] mt-1">
                        Suggested price: ${r.proposed_price.toLocaleString()}
                      </p>
                    )}

                    <div className="mt-3 flex items-center gap-2">
                      {(r.status === "pending") && (
                        <button
                          onClick={() => handleOrchestrate(r.id)}
                          disabled={orchestrating === r.id}
                          className="flex items-center gap-1 font-body text-xs bg-[#0B0B0F] text-[#FAFAF8] px-3 py-1.5 rounded-md hover:bg-[#1E3A5F] transition-colors disabled:opacity-50"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          {orchestrating === r.id ? "Processing..." : "Run Orchestrator"}
                        </button>
                      )}
                      {(r.status === "approved" || r.status === "active") && r.payment_status !== "paid" && (
                        <button
                          onClick={() => handlePay(r.id)}
                          disabled={payingId === r.id}
                          className="flex items-center gap-1 font-body text-xs bg-[#1E3A5F] text-white px-3 py-1.5 rounded-md hover:bg-[#0B0B0F] transition-colors disabled:opacity-50"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          {payingId === r.id ? "Redirecting..." : "Pay"}
                        </button>
                      )}
                      {r.payment_status === "paid" && (
                        <span className="font-body text-xs text-emerald-600 px-2 py-1">Paid</span>
                      )}
                      <Link
                        href={`/license/${r.id}`}
                        className="font-body text-xs text-[#1E3A5F] hover:underline"
                      >
                        Details
                      </Link>
                      <button
                        onClick={() => toggleLogs(r.id)}
                        className="flex items-center gap-1 font-body text-xs text-[#6B6B73] hover:text-[#0B0B0F] transition-colors ml-auto"
                      >
                        {expandedId === r.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        Logs
                      </button>
                    </div>

                    {expandedId === r.id && (
                      <div className="mt-3 space-y-2 border-t border-[#E0E0DA] pt-3">
                        {(logs[r.id] ?? []).length === 0 ? (
                          <p className="font-body text-xs text-[#6B6B73]">No agent logs yet.</p>
                        ) : (
                          (logs[r.id] ?? []).map((log, i) => (
                            <div key={i} className="flex items-start gap-2 font-body text-xs">
                              <span className="font-medium text-[#0B0B0F] min-w-[80px]">{log.agent_name}</span>
                              <span className="text-[#6B6B73]">{log.action}</span>
                              <span className="text-[#6B6B73] ml-auto text-[10px]">{log.created_at}</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
