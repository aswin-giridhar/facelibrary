/**
 * License Detail Page — View license request, contract, watermark tracking, and payment.
 */
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  X,
  Clock,
  FileText,
  CreditCard,
  Fingerprint,
  Shield,
} from "lucide-react";
import {
  getLicense,
  approveLicense,
  getAuditTrail,
  createCheckoutSession,
  generateContract,
  validateContract,
  improveContract,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-yellow-50", text: "text-yellow-700", label: "Pending" },
  under_review: { bg: "bg-blue-50", text: "text-blue-700", label: "Under Review" },
  awaiting_approval: { bg: "bg-purple-50", text: "text-purple-700", label: "Awaiting Approval" },
  approved: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Approved" },
  active: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Active" },
  rejected: { bg: "bg-red-50", text: "text-red-700", label: "Rejected" },
};

const LICENSE_TYPE_LABELS: Record<string, string> = {
  standard: "Standard License",
  exclusive: "Exclusive License",
  time_limited: "Time-Limited License",
};

export default function LicenseDetailPage() {
  const params = useParams();
  const { user } = useAuth();
  const id = Number(params.id);
  const backPath = user?.role === "client" ? "/client/dashboard"
    : user?.role === "agent" ? "/agent/dashboard"
    : user?.role === "talent" ? "/talent/dashboard"
    : "/";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [license, setLicense] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [audit, setAudit] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showContract, setShowContract] = useState(false);
  const [paying, setPaying] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [validating, setValidating] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [validation, setValidation] = useState<any>(null);
  const [improveFeedback, setImproveFeedback] = useState("");
  const [improving, setImproving] = useState(false);

  const [error, setError] = useState("");

  const loadData = () => {
    if (!id) return;
    setError("");
    Promise.all([
      getLicense(id).then(setLicense),
      getAuditTrail(id).then(setAudit).catch(() => setAudit([])),
    ])
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Failed to load license";
        setError(msg);
      })
      .finally(() => setLoading(false));
  };

  // Wait for auth to be ready before loading
  const { isLoading: authLoading } = useAuth();
  useEffect(() => {
    if (!authLoading && user) loadData();
    else if (!authLoading && !user) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, authLoading, user]);

  const handleApproval = async (approved: boolean) => {
    try {
      await approveLicense(id, approved);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleGenerateContract = async () => {
    setGenerating(true);
    try {
      await generateContract(id);
      loadData();
    } catch (err) {
      console.error(err);
    }
    setGenerating(false);
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      const res = await validateContract(id);
      setValidation(res.validation);
    } catch (err) {
      console.error(err);
    }
    setValidating(false);
  };

  const handleImprove = async () => {
    if (!improveFeedback.trim()) return;
    setImproving(true);
    try {
      await improveContract(id, improveFeedback);
      setImproveFeedback("");
      loadData();
    } catch (err) {
      console.error(err);
    }
    setImproving(false);
  };

  const handlePayment = async () => {
    setPaying(true);
    try {
      const result = await createCheckoutSession(id);
      if (result.checkout_url) window.location.href = result.checkout_url;
    } catch (err) {
      console.error(err);
    }
    setPaying(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#0B0B0F] border-t-transparent" />
      </div>
    );
  }

  if (!license) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">{error || (user ? "License not found, or you don\u2019t have access to view it." : "Please log in to view this license.")}</p>
          <Link href={user ? backPath : "/login"} className="text-black underline hover:no-underline">
            {user ? "Back to Dashboard" : "Log In"}
          </Link>
        </div>
      </div>
    );
  }

  const statusStyle = STATUS_STYLES[license.status] || STATUS_STYLES.pending;

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <nav className="flex items-center justify-between px-8 lg:px-16 h-16 border-b border-[#E0E0DA] bg-white">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#0B0B0F]">
            <span className="font-display text-sm font-bold italic text-[#0B0B0F]">FL</span>
          </div>
          <span className="font-body text-sm font-bold tracking-[0.2em] text-[#0B0B0F]">FACE LIBRARY</span>
        </Link>
        <div className="flex items-center gap-4">
          <span className="font-display text-lg text-[#0B0B0F]">License #{license.id}</span>
          <span className={`font-body text-xs px-3 py-1 rounded-full ${statusStyle.bg} ${statusStyle.text}`}>
            {statusStyle.label}
          </span>
          <Link href={backPath} className="flex items-center gap-2 font-body text-sm text-[#6B6B73] hover:text-[#0B0B0F]">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-8 py-12">
        {/* Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white border border-[#E0E0DA] rounded-lg p-6">
            <p className="font-body text-xs tracking-[0.15em] uppercase text-[#1E3A5F] mb-2">Talent</p>
            <p className="font-display text-xl text-[#0B0B0F]">{license.talent?.name || "—"}</p>
          </div>
          <div className="bg-white border border-[#E0E0DA] rounded-lg p-6">
            <p className="font-body text-xs tracking-[0.15em] uppercase text-[#1E3A5F] mb-2">Client</p>
            <p className="font-display text-xl text-[#0B0B0F]">{license.client?.company_name || "—"}</p>
          </div>
        </div>

        {/* Details */}
        <div className="bg-white border border-[#E0E0DA] rounded-lg p-6 mb-8">
          <p className="font-body text-xs tracking-[0.15em] uppercase text-[#1E3A5F] mb-4">License Details</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <div>
              <p className="font-body text-xs text-[#6B6B73]">License Type</p>
              <p className="font-body text-sm text-[#0B0B0F] mt-1">{LICENSE_TYPE_LABELS[license.license_type] || license.license_type}</p>
            </div>
            <div>
              <p className="font-body text-xs text-[#6B6B73]">Content Type</p>
              <p className="font-body text-sm text-[#0B0B0F] mt-1 capitalize">{license.content_type}</p>
            </div>
            <div>
              <p className="font-body text-xs text-[#6B6B73]">Duration</p>
              <p className="font-body text-sm text-[#0B0B0F] mt-1">{license.desired_duration_days} days</p>
            </div>
            <div>
              <p className="font-body text-xs text-[#6B6B73]">Proposed Price</p>
              <p className="font-display text-xl text-[#0B0B0F] mt-1">
                {license.proposed_price ? `£${license.proposed_price.toLocaleString()}` : "—"}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <p className="font-body text-xs text-[#6B6B73]">Use Case</p>
            <p className="font-body text-sm text-[#0B0B0F] mt-1">{license.use_case}</p>
          </div>
        </div>

        {/* Contract Section */}
        <div className="bg-white border border-[#E0E0DA] rounded-lg p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#1E3A5F]" />
              <p className="font-body text-xs tracking-[0.15em] uppercase text-[#1E3A5F]">IP Contract</p>
            </div>
            <div className="flex items-center gap-2">
              {!license.contract && (
                <button
                  onClick={handleGenerateContract}
                  disabled={generating}
                  className="font-body text-xs bg-[#1E3A5F] text-white px-4 py-2 rounded-md hover:bg-[#0B0B0F] transition-colors disabled:opacity-50"
                >
                  {generating ? "Generating..." : "Generate Contract"}
                </button>
              )}
              {license.contract && (
                <>
                  <button
                    onClick={handleValidate}
                    disabled={validating}
                    className="font-body text-xs border border-[#1E3A5F] text-[#1E3A5F] px-3 py-1.5 rounded-md hover:bg-[#1E3A5F]/5 disabled:opacity-50"
                  >
                    {validating ? "Validating..." : "Validate"}
                  </button>
                  <button
                    onClick={() => setShowContract(!showContract)}
                    className="font-body text-xs text-[#1E3A5F] underline underline-offset-4"
                  >
                    {showContract ? "Hide" : "Show"}
                  </button>
                </>
              )}
            </div>
          </div>

          {license.contract ? (
            <>
              <p className="font-body text-xs text-[#6B6B73] mb-2">
                Type: {LICENSE_TYPE_LABELS[license.contract.license_type] || license.contract.license_type}
                {" "}&middot; UK Law Compliant: {license.contract.uk_law_compliant ? "Yes" : "No"}
              </p>
              {showContract && (
                <div className="mt-4 p-6 bg-[#FAFAF8] rounded border border-[#E0E0DA] max-h-96 overflow-y-auto">
                  <pre className="font-body text-xs text-[#0B0B0F] whitespace-pre-wrap leading-relaxed">
                    {license.contract.text}
                  </pre>
                </div>
              )}

              {/* Validation results */}
              {validation && (
                <div className="mt-4 p-4 bg-blue-50 rounded border border-blue-200">
                  <p className="font-body text-xs font-semibold text-blue-700 mb-2">
                    Validation Score: {validation.overall_score}/10
                    {validation.is_valid ? " (Valid)" : " (Issues Found)"}
                  </p>
                  {validation.summary && (
                    <p className="font-body text-xs text-blue-600 mb-2">{validation.summary}</p>
                  )}
                  {validation.issues?.length > 0 && (
                    <ul className="space-y-1">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {validation.issues.map((issue: any, i: number) => (
                        <li key={i} className="font-body text-xs text-blue-600">
                          [{issue.severity}] {issue.issue} — {issue.suggestion}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Improve contract */}
              <div className="mt-4 flex gap-2">
                <input
                  type="text"
                  value={improveFeedback}
                  onChange={(e) => setImproveFeedback(e.target.value)}
                  placeholder="Suggest improvements to the contract..."
                  className="flex-1 px-3 py-2 border border-[#E0E0DA] rounded-md font-body text-xs focus:outline-none focus:border-[#1E3A5F]"
                />
                <button
                  onClick={handleImprove}
                  disabled={improving || !improveFeedback.trim()}
                  className="font-body text-xs bg-[#0B0B0F] text-white px-4 py-2 rounded-md hover:bg-[#1E3A5F] disabled:opacity-50"
                >
                  {improving ? "Improving..." : "Improve"}
                </button>
              </div>
            </>
          ) : (
            <p className="font-body text-sm text-[#6B6B73]">No contract generated yet.</p>
          )}
        </div>

        {/* Watermark Tracking */}
        {license.watermark_tracking?.length > 0 && (
          <div className="bg-white border border-[#E0E0DA] rounded-lg p-6 mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Fingerprint className="w-4 h-4 text-[#1E3A5F]" />
              <p className="font-body text-xs tracking-[0.15em] uppercase text-[#1E3A5F]">Watermark Tracking</p>
            </div>
            <div className="space-y-2">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {license.watermark_tracking.map((t: any) => (
                <div key={t.id} className={`flex items-center justify-between p-3 rounded border ${
                  t.is_authorized ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
                }`}>
                  <div>
                    <span className="font-body text-xs font-medium">{t.platform || "Unknown"}</span>
                    {t.url && <span className="font-body text-xs text-[#6B6B73] ml-2">{t.url}</span>}
                  </div>
                  <span className={`font-body text-xs px-2 py-1 rounded ${
                    t.is_authorized ? "text-emerald-700" : "text-red-700 font-semibold"
                  }`}>
                    {t.is_authorized ? "Authorized" : "VIOLATION"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Approval Buttons */}
        {license.status === "awaiting_approval" && (
          <div className="flex gap-4 mb-8">
            <button
              onClick={() => handleApproval(true)}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-600 text-white font-body text-sm font-medium py-4 rounded-md hover:bg-emerald-700"
            >
              <Check className="w-4 h-4" /> Approve License
            </button>
            <button
              onClick={() => handleApproval(false)}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-red-600 text-white font-body text-sm font-medium py-4 rounded-md hover:bg-red-700"
            >
              <X className="w-4 h-4" /> Reject License
            </button>
          </div>
        )}

        {/* Payment */}
        {(license.status === "approved" || license.status === "active") && (
          <div className="bg-white border border-[#E0E0DA] rounded-lg p-6 mb-8">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="w-4 h-4 text-[#1E3A5F]" />
              <p className="font-body text-xs tracking-[0.15em] uppercase text-[#1E3A5F]">Payment</p>
            </div>
            {license.payment_status === "paid" ? (
              <span className="inline-flex items-center gap-1.5 font-body text-sm text-emerald-700 bg-emerald-50 px-4 py-2 rounded-full">
                <Check className="w-4 h-4" /> Paid
              </span>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-body text-sm text-[#0B0B0F]">
                    Fee: <span className="font-display text-lg">£{(license.proposed_price || 0).toLocaleString()}</span>
                  </p>
                  <p className="font-body text-xs text-[#6B6B73] mt-1">Secure payment via Stripe. 10% platform fee.</p>
                </div>
                <button
                  onClick={handlePayment}
                  disabled={paying}
                  className="inline-flex items-center gap-2 bg-[#1E3A5F] text-white font-body text-sm px-6 py-3 rounded-md hover:bg-[#0B0B0F] disabled:opacity-50"
                >
                  <CreditCard className="w-4 h-4" />
                  {paying ? "Redirecting..." : "Pay Now"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Admin Review Notes */}
        {license.admin_notes && (
          <div className="bg-white border border-[#E0E0DA] rounded-lg p-6 mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-[#1E3A5F]" />
              <p className="font-body text-xs tracking-[0.15em] uppercase text-[#1E3A5F]">Admin Review</p>
            </div>
            <p className="font-body text-sm text-[#0B0B0F]">{license.admin_notes}</p>
            {license.reviewed_by && (
              <p className="font-body text-xs text-[#6B6B73] mt-2">
                Reviewed by {license.reviewed_by} on {license.reviewed_at ? new Date(license.reviewed_at).toLocaleString() : "—"}
              </p>
            )}
          </div>
        )}

        {/* Audit Trail */}
        {audit.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-[#6B6B73]" />
              <p className="font-body text-xs tracking-[0.15em] uppercase text-[#6B6B73]">Audit Trail</p>
            </div>
            <div className="space-y-2">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {audit.map((entry: any) => (
                <div key={entry.id} className="flex gap-3 bg-white border border-[#E0E0DA] rounded-lg p-3">
                  <div className="w-2 h-2 rounded-full bg-[#1E3A5F] mt-1.5 shrink-0" />
                  <div>
                    <span className="font-body text-xs font-semibold text-[#0B0B0F]">{entry.agent_name}</span>
                    <span className="font-body text-xs text-[#6B6B73] ml-2">{entry.action}</span>
                    {entry.details && (
                      <p className="font-body text-[10px] text-[#6B6B73] mt-0.5">{entry.details}</p>
                    )}
                    <p className="font-body text-[10px] text-[#6B6B73] mt-0.5">
                      {new Date(entry.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
