/**
 * Agent Dashboard -- Manage talent roster, approvals, and contracts.
 *
 * Layout (Figma):
 * - Top nav: FL logo (black square) + tabs (Dashboard, Talent, Contracts, Analytics, Settings) + user avatar + logout
 * - 3-column grid (col-span-3 / col-span-6 / col-span-3)
 *   LEFT: Agency Profile, Managed Talents list, Quick Actions
 *   CENTER: Onboarding steps, Active Requests table, Talent Management
 *   RIGHT: AI Agent Assistant, Revenue Overview, Contracts
 *
 * Accessible at: /agent/dashboard (requires agent role)
 */
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users,
  Clock,
  FileText,
  Shield,
  MapPin,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Send,
  Plus,
  BarChart3,
  Mail,
  Phone,
  Instagram,
  Globe,
  Image as ImageIcon,
  Edit3,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { FloatingAIChat } from "@/components/FloatingAIChat";
import AgentTopNav from "@/components/AgentTopNav";
import EditProfileModal from "@/components/EditProfileModal";
import {
  getAgent,
  getAgentRequests,
  approveLicense,
  postChat,
  getActivityFeed,
  downloadAgencyStatement,
  sendContractToTalent,
  updateAgent,
  type ChatMessage,
  type ActivityItem,
} from "@/lib/api";

/* ---------- Types ---------- */

interface ManagedTalent {
  id: number;
  name: string;
  geo_scope: string;
  approval_type: string;
  categories: string | null;
  image_url: string | null;
}

interface AgentProfileData {
  id: number;
  name: string;
  email: string;
  agency_name: string;
  website: string | null;
  country: string | null;
  team_size: string | null;
  default_restricted_categories: string | null;
  approval_workflow: string;
  managed_talents: ManagedTalent[];
}

interface RequestData {
  id: number;
  status: string;
  talent_name: string;
  brand_name: string;
  use_case: string;
  content_type: string;
  desired_duration_days: number;
  proposed_price: number | null;
  created_at: string;
  contract_generated?: boolean;
}

/* ---------- Constants ---------- */

/* ---------- Component ---------- */

export default function AgentDashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<AgentProfileData | null>(null);
  const [requests, setRequests] = useState<RequestData[]>([]);
  const [expandedRequest, setExpandedRequest] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [chatMessage, setChatMessage] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hi! I can help you manage your talent roster, review contracts, and analyze campaign performance. What would you like to do?" },
  ]);
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [sendingContractId, setSendingContractId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const handleChatSubmit = async () => {
    const text = chatMessage.trim();
    if (!text || chatSending) return;
    setChatError(null);
    const next: ChatMessage[] = [...chatMessages, { role: "user" as const, content: text }].slice(-50);
    setChatMessages(next);
    setChatMessage("");
    setChatSending(true);
    try {
      const res = await postChat("agent", next);
      setChatMessages((prev) => [...prev, { role: "assistant" as const, content: res.reply }].slice(-50));
    } catch (e) {
      setChatError(e instanceof Error ? e.message : "AI assistant unavailable");
    } finally {
      setChatSending(false);
    }
  };

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "agent")) {
      router.push("/login");
      return;
    }
    if (user) {
      findAndLoadProfile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  const findAndLoadProfile = async () => {
    try {
      if (user?.profile_id) {
        await loadData(user.profile_id);
        return;
      }
      // Fallback: fetch agent profiles and find by user_id
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/talents`);
      // Try to get agent profile directly using user_id
      // The getAgent endpoint needs an agent_id, not user_id
      // So we try sequential IDs (small dataset)
      for (let id = 1; id <= 20; id++) {
        try {
          const agent = await getAgent(id);
          if (agent && agent.user_id === user?.user_id) {
            await loadData(id);
            return;
          }
        } catch {
          continue;
        }
      }
      setLoading(false);
    } catch {
      setLoading(false);
    }
  };

  const loadData = async (profileId: number) => {
    try {
      const [p, r, a] = await Promise.all([
        getAgent(profileId),
        getAgentRequests(profileId),
        getActivityFeed(15).catch(() => [] as ActivityItem[]),
      ]);
      setProfile(p);
      setRequests(r);
      setActivity(a || []);
    } catch {
      // Profile may not exist yet
    }
    setLoading(false);
  };

  const handleRequestAction = async (id: number, approved: boolean) => {
    try {
      await approveLicense(id, approved);
      if (user?.profile_id) loadData(user.profile_id);
    } catch {
      // error
    }
  };

  const handleSendToTalent = async (id: number) => {
    setSendingContractId(id);
    try {
      await sendContractToTalent(id);
      if (user?.profile_id) loadData(user.profile_id);
    } catch {
      // swallow — UI shows status from refresh
    } finally {
      setSendingContractId(null);
    }
  };

  if (authLoading || loading || !user || user.role !== "agent") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-black border-t-transparent" />
      </div>
    );
  }

  const managedTalents = profile?.managed_talents || [];
  const pendingRequests = requests.filter(
    (r) => r.status === "awaiting_approval" || r.status === "pending"
  );
  const activeRequests = requests.filter(
    (r) => r.status === "active" || r.status === "approved"
  );
  const totalRevenue = activeRequests.reduce(
    (sum, r) => sum + (r.proposed_price ?? 0),
    0
  );

  return (
    <div className="min-h-screen bg-white">
      <AgentTopNav active="Dashboard" />

      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold">Agency Dashboard</h1>
          <p className="text-gray-600 text-base mt-1">
            Manage your talent roster, review license requests, and track revenue.
          </p>
        </div>
        {/* ===== 3-column grid ===== */}
        <div className="grid grid-cols-12 gap-6">
          {/* ===== LEFT COLUMN (col-span-3) ===== */}
          <div className="col-span-12 lg:col-span-3 space-y-6">
            {/* Agency Profile */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">
                  🏢 Agency Profile
                </h3>
                <button
                  onClick={() => setEditOpen(true)}
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-black transition-colors"
                  aria-label="Edit Agency Profile"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Edit
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-base font-semibold text-gray-900">
                    {profile?.agency_name || "Your Agency"}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {profile?.name || user?.name || "---"}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Mail className="w-3.5 h-3.5" />
                  <span className="truncate">
                    {profile?.email || user?.email || "---"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Globe className="w-3.5 h-3.5" />
                  <span>{profile?.country || "United Kingdom"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Phone className="w-3.5 h-3.5" />
                  <span>{process.env.NEXT_PUBLIC_SUPPORT_PHONE || "—"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Instagram className="w-3.5 h-3.5" />
                  <span>
                    @{(profile?.agency_name || "agency")
                      .toLowerCase()
                      .replace(/\s/g, "")}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                Quick Actions
              </h3>
              <div className="space-y-2">
                <button
                  onClick={() => router.push("/add-new-talent")}
                  className="w-full flex items-center gap-2 bg-black text-white py-2 px-4 rounded-lg text-sm hover:bg-gray-800 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Talent
                </button>
                <button
                  onClick={() => router.push("/contract-templates")}
                  className="w-full flex items-center gap-2 border border-gray-200 text-gray-900 py-2 px-4 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" /> Generate Contract
                </button>
                <Link
                  href="/agent/billing"
                  className="w-full flex items-center gap-2 border border-gray-200 text-gray-900 py-2 px-4 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                >
                  <BarChart3 className="w-3.5 h-3.5" /> View Analytics
                </Link>
              </div>
            </div>
          </div>

          {/* ===== CENTER COLUMN (col-span-6) ===== */}
          <div className="col-span-12 lg:col-span-6 space-y-6">
            {/* Onboarding Steps */}
            {managedTalents.length === 0 && (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  Get Started
                </h3>
                <p className="text-xs text-gray-500 mb-4">
                  Complete these steps to set up your agency.
                </p>
                <div className="space-y-3">
                  {[
                    "Complete agency profile",
                    "Add your first talent",
                    "Set approval workflows",
                    "Configure contract templates",
                  ].map((step, i) => (
                    <div key={step} className="flex items-center gap-3">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                          i === 0
                            ? "bg-black text-white"
                            : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        {i + 1}
                      </div>
                      <span className="text-sm text-gray-700">{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Your Talents (Figma label) */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">
                  👥 Your Talents
                </h3>
                <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {managedTalents.length}
                </span>
              </div>
              {managedTalents.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No talents linked yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {managedTalents.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-3"
                    >
                      <div className="w-9 h-9 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {t.image_url ? (
                          <img
                            src={t.image_url}
                            alt={t.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {t.name}
                        </p>
                        <p className="text-xs text-gray-500 capitalize">
                          {t.geo_scope}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* License Requests (Figma center col) */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                📩 License Requests
              </h3>
              {requests.length === 0 ? (
                <p className="text-sm text-gray-500">No requests yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2.5 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Talent
                        </th>
                        <th className="text-left py-2.5 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Brand
                        </th>
                        <th className="text-left py-2.5 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="text-left py-2.5 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Price
                        </th>
                        <th className="text-left py-2.5 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="text-right py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {requests.map((r) => (
                        <tr
                          key={r.id}
                          className="border-b border-gray-100 last:border-0"
                        >
                          <td className="py-3 pr-4">
                            <span className="font-medium text-gray-900">
                              {r.talent_name}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-gray-500 text-xs">
                            {r.brand_name}
                          </td>
                          <td className="py-3 pr-4 text-gray-500 text-xs capitalize">
                            {r.content_type}
                          </td>
                          <td className="py-3 pr-4 text-xs font-medium text-gray-900">
                            {r.proposed_price != null
                              ? `\u00A3${r.proposed_price.toLocaleString()}`
                              : "---"}
                          </td>
                          <td className="py-3 pr-4">
                            <span
                              className={`text-xs px-2.5 py-0.5 rounded-full capitalize font-medium ${
                                r.status === "active" || r.status === "approved"
                                  ? "bg-green-50 text-green-700"
                                  : r.status === "rejected"
                                  ? "bg-red-50 text-red-700"
                                  : r.status === "awaiting_approval" ||
                                    r.status === "pending"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {r.status.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {(r.status === "awaiting_approval" ||
                                r.status === "pending") && (
                                <>
                                  <button
                                    onClick={() =>
                                      handleRequestAction(r.id, true)
                                    }
                                    className="flex items-center gap-1 text-xs font-medium bg-black text-white px-2.5 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
                                  >
                                    <CheckCircle className="h-3 w-3" /> Approve
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleRequestAction(r.id, false)
                                    }
                                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 transition-colors"
                                  >
                                    <XCircle className="h-3 w-3" /> Reject
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Contracts & IP */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">
                  📄 Contracts &amp; IP
                </h3>
                <Link
                  href="/contract-templates"
                  className="text-xs text-gray-500 hover:text-black"
                >
                  View all →
                </Link>
              </div>
              {requests.length === 0 ? (
                <p className="text-sm text-gray-500">No contracts yet.</p>
              ) : (
                <div className="space-y-3">
                  {requests.slice(0, 4).map((r) => {
                    const canSend =
                      r.contract_generated && r.status === "under_review";
                    return (
                      <div
                        key={r.id}
                        className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0"
                      >
                        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-900 truncate">
                            {r.talent_name}{" "}
                            <span className="text-gray-400">×</span>{" "}
                            {r.brand_name}
                          </p>
                          <p className="text-xs text-gray-400">
                            {r.created_at
                              ? new Date(r.created_at).toLocaleDateString("en-GB", {
                                  day: "2-digit", month: "short", year: "numeric",
                                })
                              : ""}
                          </p>
                        </div>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full capitalize font-medium ${
                            r.status === "active" || r.status === "approved"
                              ? "bg-green-50 text-green-700"
                              : r.status === "pending" ||
                                r.status === "awaiting_approval"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {r.status.replace(/_/g, " ")}
                        </span>
                        {canSend && (
                          <button
                            onClick={() => handleSendToTalent(r.id)}
                            disabled={sendingContractId === r.id}
                            className="text-xs px-2 py-1 rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
                          >
                            {sendingContractId === r.id ? "Sending…" : "Send to Talent"}
                          </button>
                        )}
                        <Link
                          href={`/license/${r.id}`}
                          className="text-xs text-gray-500 hover:text-black hover:underline px-1"
                        >
                          View
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Talent Management */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">
                  Talent Management
                </h3>
                <button
                  onClick={() => router.push("/add-new-talent")}
                  className="bg-black text-white py-1.5 px-3 rounded-lg text-xs hover:bg-gray-800 transition-colors"
                >
                  + Add Talent
                </button>
              </div>
              {managedTalents.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 mb-1">
                    No talents linked yet.
                  </p>
                  <p className="text-xs text-gray-400">
                    Talents can link to your agency during onboarding, or you
                    can send them an invite.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {managedTalents.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-4 rounded-lg border border-gray-200 p-4"
                    >
                      <div className="w-12 h-12 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {t.image_url ? (
                          <img
                            src={t.image_url}
                            alt={t.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ImageIcon className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {t.name}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          {t.categories && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                              {t.categories}
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <MapPin className="h-3 w-3" />
                            <span className="capitalize">{t.geo_scope}</span>
                          </span>
                        </div>
                      </div>
                      <Link
                        href={`/talent-profile/${t.id}`}
                        className="text-xs text-gray-500 hover:text-black transition-colors"
                      >
                        Manage &rarr;
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ===== RIGHT COLUMN (col-span-3) ===== */}
          <div className="col-span-12 lg:col-span-3 space-y-6">
            {/* Agency Earnings (Figma right col top) */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                💵 Agency Earnings
              </h3>
              <div className="text-center py-3 rounded-lg bg-gray-50 border border-gray-200 mb-4">
                <p className="text-2xl font-bold text-gray-900">
                  {"£"}{totalRevenue.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 mt-1">Total Revenue</p>
              </div>
              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between text-sm py-1.5">
                  <span className="text-gray-500">Agent Commission (10%)</span>
                  <span className="font-medium text-gray-900">
                    {"£"}{Math.round(totalRevenue * 0.1).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm py-1.5">
                  <span className="text-gray-500">Pending Payouts</span>
                  <span className="font-medium text-amber-600">
                    {"£"}
                    {pendingRequests
                      .reduce((sum, r) => sum + (r.proposed_price ?? 0), 0)
                      .toLocaleString()}
                  </span>
                </div>
              </div>
              <Link
                href="/agent/billing"
                className="block text-center text-xs bg-black text-white py-2 rounded-lg hover:bg-gray-800 transition-colors mb-2"
              >
                View Payment Breakdown →
              </Link>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={async () => {
                    if (!profile?.id) return;
                    try { await downloadAgencyStatement(profile.id); }
                    catch (e) { console.error(e); }
                  }}
                  className="text-xs border border-gray-300 text-gray-700 py-2 rounded-lg hover:border-black hover:text-black transition-colors"
                >
                  Download Statement
                </button>
                <Link
                  href="/agent/billing#bank-account"
                  className="text-center text-xs border border-gray-300 text-gray-700 py-2 rounded-lg hover:border-black hover:text-black transition-colors"
                >
                  Manage Payout Details
                </Link>
              </div>
            </div>

            {/* AI Agent Assistant */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="bg-black text-white px-4 py-3">
                <h3 className="text-sm font-medium">AI Agent Assistant</h3>
              </div>
              <div className="p-4 h-48 sm:h-60 md:h-72 overflow-y-auto space-y-2">
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`rounded-lg p-3 text-xs whitespace-pre-line ${
                      msg.role === "assistant"
                        ? "bg-gray-50 text-gray-700"
                        : "bg-black text-white ml-4"
                    }`}
                  >
                    {msg.content}
                  </div>
                ))}
                {chatSending && (
                  <div className="rounded-lg p-3 text-xs bg-gray-50 text-gray-500 italic">Thinking…</div>
                )}
                {chatError && (
                  <div className="rounded-lg p-3 text-xs bg-red-50 text-red-700 border border-red-200">
                    {chatError}
                  </div>
                )}
              </div>
              <div className="border-t border-gray-200 p-3">
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="text"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleChatSubmit(); } }}
                    placeholder="Ask me anything..."
                    disabled={chatSending}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent disabled:opacity-60"
                  />
                  <button
                    onClick={handleChatSubmit}
                    disabled={!chatMessage.trim() || chatSending}
                    className="bg-black text-white p-2 rounded-lg hover:bg-gray-800 transition-colors flex-shrink-0 disabled:opacity-50"
                  >
                    <Send className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {["Review deals", "Generate contract", "Analyze talent"].map((action) => (
                    <button
                      key={action}
                      onClick={() => setChatMessage(action)}
                      disabled={chatSending}
                      className="text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Activity */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                🔔 Activity
              </h3>
              {activity.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No recent activity. Approved requests and contract events
                  will appear here.
                </p>
              ) : (
                <ul className="space-y-3">
                  {activity.slice(0, 8).map((a) => {
                    const actionText = a.action
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, (c) => c.toUpperCase());
                    const isApproval = a.action.includes("approv");
                    return (
                      <li key={a.id} className="flex items-start gap-3">
                        {isApproval ? (
                          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                        ) : (
                          <Clock className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm text-gray-800 leading-snug">
                            {actionText}
                            {a.license_id ? (
                              <span className="text-gray-500"> #{a.license_id}</span>
                            ) : null}
                          </p>
                          <p className="text-[11px] text-gray-400">
                            {new Date(a.created_at).toLocaleString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <Link
                href="/messages"
                className="mt-4 block text-center text-xs text-gray-600 hover:text-black font-medium"
              >
                View All Notifications →
              </Link>
            </div>

          </div>
        </div>
      </div>
      <FloatingAIChat variant="agent" />
      <EditProfileModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Agency Profile"
        fields={[
          { name: "name", label: "Your Name", placeholder: "Jane Smith" },
          { name: "agency_name", label: "Agency Name", placeholder: "Acme Talent" },
          { name: "website", label: "Website", type: "url", placeholder: "https://acme.com" },
          { name: "instagram", label: "Instagram", placeholder: "@acmetalent" },
          { name: "industry", label: "Industry", placeholder: "Modeling, Music, Sports…" },
          { name: "portfolio_url", label: "Portfolio URL", type: "url" },
        ]}
        initial={{
          name: profile?.name ?? user?.name ?? "",
          agency_name: profile?.agency_name ?? "",
          website: profile?.website ?? "",
          instagram: (profile as { instagram?: string } | null)?.instagram ?? "",
          industry: (profile as { industry?: string } | null)?.industry ?? "",
          portfolio_url: (profile as { portfolio_url?: string } | null)?.portfolio_url ?? "",
        }}
        onSave={async (data) => {
          if (!profile?.id) throw new Error("Agency profile not loaded");
          await updateAgent(profile.id, data);
          const fresh = await getAgent(profile.id);
          setProfile(fresh as AgentProfileData);
        }}
      />
    </div>
  );
}
