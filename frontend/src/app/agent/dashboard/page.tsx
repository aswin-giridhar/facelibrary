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
  User,
  Users,
  Clock,
  FileText,
  Shield,
  MapPin,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  LogOut,
  Send,
  Plus,
  BarChart3,
  Mail,
  Phone,
  Instagram,
  Globe,
  Image as ImageIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { FloatingAIChat } from "@/components/FloatingAIChat";
import { getAgent, getAgentRequests, approveLicense, postChat, type ChatMessage } from "@/lib/api";

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
}

/* ---------- Constants ---------- */

const NAV_TABS: { label: string; href?: string }[] = [
  { label: "Dashboard" },
  { label: "Talent", href: "/discover-talent" },
  { label: "Contracts", href: "/contract-templates" },
  { label: "Analytics" },
  { label: "Settings" },
];

/* ---------- Component ---------- */

export default function AgentDashboardPage() {
  const { user, logout, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<AgentProfileData | null>(null);
  const [requests, setRequests] = useState<RequestData[]>([]);
  const [expandedRequest, setExpandedRequest] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [chatMessage, setChatMessage] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hi! I can help you manage your talent roster, review contracts, and analyze campaign performance. What would you like to do?" },
  ]);
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

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
      const [p, r] = await Promise.all([
        getAgent(profileId),
        getAgentRequests(profileId),
      ]);
      setProfile(p);
      setRequests(r);
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

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  if (authLoading || loading) {
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
      {/* ===== Top Nav Bar ===== */}
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
                const active = activeTab === tab.label;
                const common = `px-3 py-4 text-sm transition-colors relative ${
                  active ? "text-black font-medium" : "text-gray-500 hover:text-black"
                }`;
                const indicator = active && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-black" />
                );
                if (tab.href) {
                  return (
                    <Link key={tab.label} href={tab.href} className={common}>
                      {tab.label}
                      {indicator}
                    </Link>
                  );
                }
                return (
                  <button
                    key={tab.label}
                    onClick={() => setActiveTab(tab.label)}
                    className={common}
                  >
                    {tab.label}
                    {indicator}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-medium text-gray-900">
              {profile?.name || user?.name || "---"}
            </span>
            <button
              onClick={handleLogout}
              className="text-gray-400 hover:text-gray-700 transition-colors ml-1"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8">
        {/* ===== 3-column grid ===== */}
        <div className="grid grid-cols-12 gap-6">
          {/* ===== LEFT COLUMN (col-span-3) ===== */}
          <div className="col-span-12 lg:col-span-3 space-y-6">
            {/* Agency Profile */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                Agency Profile
              </h3>
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

            {/* Managed Talents */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">
                  Managed Talents
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
                <button className="w-full flex items-center gap-2 border border-gray-200 text-gray-900 py-2 px-4 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                  <BarChart3 className="w-3.5 h-3.5" /> View Analytics
                </button>
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

            {/* Active Requests */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                Active Requests
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
                      <button className="text-xs text-gray-500 hover:text-black transition-colors">
                        Manage &rarr;
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ===== RIGHT COLUMN (col-span-3) ===== */}
          <div className="col-span-12 lg:col-span-3 space-y-6">
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

            {/* Revenue Overview */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                Revenue Overview
              </h3>
              <div className="text-center py-3 rounded-lg bg-gray-50 border border-gray-200 mb-4">
                <p className="text-2xl font-bold text-gray-900">
                  {"\u00A3"}{totalRevenue.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 mt-1">Total Revenue</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm py-1.5">
                  <span className="text-gray-500">This Month</span>
                  <span className="font-medium text-gray-900">
                    {"\u00A3"}{Math.round(totalRevenue * 0.3).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm py-1.5">
                  <span className="text-gray-500">Pending</span>
                  <span className="font-medium text-amber-600">
                    {"\u00A3"}
                    {pendingRequests
                      .reduce((sum, r) => sum + (r.proposed_price ?? 0), 0)
                      .toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Contracts */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                Contracts
              </h3>
              {requests.length === 0 ? (
                <p className="text-sm text-gray-500">No contracts yet.</p>
              ) : (
                <div className="space-y-3">
                  {requests.slice(0, 4).map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-gray-900 truncate">
                          {r.talent_name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {r.brand_name}
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <FloatingAIChat variant="agent" />
    </div>
  );
}
