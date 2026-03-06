/**
 * License Detail Page — Full view of a single license request and its pipeline results.
 *
 * Displays:
 * - License status, talent & brand info, use case details
 * - Risk assessment from Compliance & Risk Agent
 * - Proposed pricing from Pricing Negotiator Agent
 * - Full contract text from IP Contract Agent
 * - License token, fingerprint ID, Web3 contract metadata
 * - Audit trail timeline from all agents
 * - Approve/reject actions (for talent reviewing the request)
 *
 * Accessible at: /license/[id] (linked from dashboards and request lists)
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
  Shield,
  FileText,
  AlertTriangle,
  CreditCard,
} from "lucide-react";
import { getLicense, approveLicense, getAuditTrail, createCheckoutSession } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface LicenseData {
  id: number;
  status: string;
  talent: { id: number; name: string };
  brand: { id: number; company: string };
  use_case: string;
  campaign_description: string;
  content_type: string;
  desired_duration_days: number;
  desired_regions: string;
  exclusivity: boolean;
  proposed_price: number | null;
  risk_score: string | null;
  negotiation_notes: string | null;
  compliance_notes: string | null;
  contract: {
    id: number;
    text: string;
    model_used: string;
    generated_at: string;
  } | null;
  payment_status: string | null;
  created_at: string;
}

interface AuditEntry {
  id: number;
  agent: string;
  action: string;
  details: string;
  model: string;
  tokens: number;
  timestamp: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-yellow-50", text: "text-yellow-700", label: "Pending" },
  negotiating: { bg: "bg-blue-50", text: "text-blue-700", label: "Negotiating" },
  awaiting_approval: { bg: "bg-purple-50", text: "text-purple-700", label: "Awaiting Approval" },
  approved: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Approved" },
  active: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Active" },
  rejected: { bg: "bg-red-50", text: "text-red-700", label: "Rejected" },
  rejected_compliance: { bg: "bg-red-50", text: "text-red-700", label: "Rejected (Compliance)" },
};

export default function LicenseDetailPage() {
  const params = useParams();
  const { user } = useAuth();
  const id = Number(params.id);
  // Navigate back to role-specific dashboard
  const backPath = user?.role === "brand" ? "/brand/dashboard"
    : user?.role === "agent" ? "/agent/dashboard"
    : user?.role === "talent" ? "/talent/dashboard"
    : "/";
  const [license, setLicense] = useState<LicenseData | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showContract, setShowContract] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      getLicense(id).then(setLicense),
      getAuditTrail(id).then((data) => setAudit(data.audit_trail || [])),
    ])
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const handleApproval = async (approved: boolean) => {
    try {
      await approveLicense(id, approved, approved ? "Terms accepted" : "Terms rejected");
      const updated = await getLicense(id);
      setLicense(updated);
    } catch (err) {
      console.error(err);
    }
  };

  const handlePayment = async () => {
    setPaying(true);
    try {
      const result = await createCheckoutSession(id);
      if (result.checkout_url) {
        window.location.href = result.checkout_url;
      }
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Payment failed");
    }
    setPaying(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
        <p className="font-body text-[#6B6B73]">Loading license...</p>
      </div>
    );
  }

  if (!license) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
        <p className="font-body text-[#6B6B73]">License not found.</p>
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
          <div className="flex flex-col">
            <span className="font-body text-sm font-bold tracking-[0.2em] text-[#0B0B0F]">FACE LIBRARY</span>
            <span className="font-body text-[7px] font-light tracking-[0.25em] text-[#6B6B73]">LIKENESS INFRASTRUCTURE</span>
          </div>
        </Link>
        <div className="flex items-center gap-4">
          <span className="font-display text-lg text-[#0B0B0F]">License #{license.id}</span>
          <span className={`font-body text-xs px-3 py-1 rounded-full ${statusStyle.bg} ${statusStyle.text}`}>
            {statusStyle.label}
          </span>
          <Link href={backPath} className="flex items-center gap-2 font-body text-sm text-[#6B6B73] hover:text-[#0B0B0F] transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-8 py-16">
        {/* Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          <div className="bg-white border border-[#E0E0DA] rounded-lg p-6">
            <p className="font-body text-xs tracking-[0.15em] uppercase text-[#1E3A5F] mb-4">Talent</p>
            <p className="font-display text-2xl text-[#0B0B0F]">{license.talent.name}</p>
          </div>
          <div className="bg-white border border-[#E0E0DA] rounded-lg p-6">
            <p className="font-body text-xs tracking-[0.15em] uppercase text-[#1E3A5F] mb-4">Brand</p>
            <p className="font-display text-2xl text-[#0B0B0F]">{license.brand.company}</p>
          </div>
        </div>

        {/* Details */}
        <div className="bg-white border border-[#E0E0DA] rounded-lg p-6 mb-8">
          <p className="font-body text-xs tracking-[0.15em] uppercase text-[#1E3A5F] mb-4">License Details</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <div>
              <p className="font-body text-xs text-[#6B6B73]">Use Case</p>
              <p className="font-body text-sm text-[#0B0B0F] mt-1">{license.use_case}</p>
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
        </div>

        {/* Agent Results */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Compliance */}
          <div className="bg-white border border-[#E0E0DA] rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-[#1E3A5F]" />
              <p className="font-body text-xs tracking-[0.15em] uppercase text-[#1E3A5F]">Compliance Check</p>
            </div>
            {license.risk_score && (
              <div className="mb-3">
                <span className={`font-body text-xs px-3 py-1 rounded-full ${
                  license.risk_score === "low" ? "bg-emerald-50 text-emerald-700" :
                  license.risk_score === "medium" ? "bg-yellow-50 text-yellow-700" :
                  "bg-red-50 text-red-700"
                }`}>
                  Risk: {license.risk_score}
                </span>
              </div>
            )}
            <p className="font-body text-xs text-[#6B6B73] leading-relaxed">
              {license.compliance_notes || "Awaiting compliance check"}
            </p>
          </div>

          {/* Negotiation */}
          <div className="bg-white border border-[#E0E0DA] rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-[#1E3A5F]" />
              <p className="font-body text-xs tracking-[0.15em] uppercase text-[#1E3A5F]">Negotiation</p>
            </div>
            <p className="font-body text-xs text-[#6B6B73] leading-relaxed">
              {license.negotiation_notes || "Awaiting negotiation"}
            </p>
          </div>
        </div>

        {/* Contract */}
        {license.contract && (
          <div className="bg-white border border-[#E0E0DA] rounded-lg p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#1E3A5F]" />
                <p className="font-body text-xs tracking-[0.15em] uppercase text-[#1E3A5F]">
                  Generated Contract
                </p>
              </div>
              <button
                onClick={() => setShowContract(!showContract)}
                className="font-body text-xs text-[#1E3A5F] underline underline-offset-4"
              >
                {showContract ? "Hide" : "Show"} Contract
              </button>
            </div>
            <div className="flex items-center gap-4 text-xs text-[#6B6B73] mb-3">
              <span>Model: {license.contract.model_used}</span>
              <span>Generated: {new Date(license.contract.generated_at).toLocaleString()}</span>
            </div>
            {showContract && (
              <div className="mt-4 p-6 bg-[#FAFAF8] rounded border border-[#E0E0DA] max-h-96 overflow-y-auto">
                <pre className="font-body text-xs text-[#0B0B0F] whitespace-pre-wrap leading-relaxed">
                  {license.contract.text}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Approval Buttons */}
        {license.status === "awaiting_approval" && (
          <div className="flex gap-4 mb-12">
            <button
              onClick={() => handleApproval(true)}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-600 text-white font-body text-sm font-medium py-4 rounded-md hover:bg-emerald-700 transition-colors"
            >
              <Check className="w-4 h-4" />
              Approve License
            </button>
            <button
              onClick={() => handleApproval(false)}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-red-600 text-white font-body text-sm font-medium py-4 rounded-md hover:bg-red-700 transition-colors"
            >
              <X className="w-4 h-4" />
              Reject License
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
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 font-body text-sm text-emerald-700 bg-emerald-50 px-4 py-2 rounded-full">
                  <Check className="w-4 h-4" />
                  Paid
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <p className="font-body text-sm text-[#0B0B0F]">
                    License fee: <span className="font-display text-lg">£{(license.proposed_price || 0).toLocaleString()}</span>
                  </p>
                  <p className="font-body text-xs text-[#6B6B73] mt-1">
                    Secure payment via Stripe Connect. 10% platform fee included.
                  </p>
                </div>
                <button
                  onClick={handlePayment}
                  disabled={paying}
                  className="inline-flex items-center gap-2 bg-[#1E3A5F] text-white font-body text-sm font-medium px-6 py-3 rounded-md hover:bg-[#0B0B0F] transition-colors disabled:opacity-50"
                >
                  <CreditCard className="w-4 h-4" />
                  {paying ? "Redirecting..." : "Pay Now"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Audit Trail */}
        {audit.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-6">
              <Clock className="w-4 h-4 text-[#6B6B73]" />
              <p className="font-body text-xs tracking-[0.15em] uppercase text-[#6B6B73]">
                Audit Trail
              </p>
            </div>
            <div className="space-y-3">
              {audit.map((entry) => (
                <div key={entry.id} className="flex gap-4 bg-white border border-[#E0E0DA] rounded-lg p-4">
                  <div className="w-2 h-2 rounded-full bg-[#1E3A5F] mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-body text-xs font-semibold text-[#0B0B0F]">{entry.agent}</span>
                      <span className="font-body text-xs text-[#6B6B73]">{entry.action}</span>
                    </div>
                    {entry.model && (
                      <span className="font-body text-[10px] text-[#1E3A5F]">{entry.model}</span>
                    )}
                    <p className="font-body text-[10px] text-[#6B6B73] mt-1">
                      {new Date(entry.timestamp).toLocaleString()}
                      {entry.tokens > 0 && ` · ${entry.tokens} tokens`}
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
