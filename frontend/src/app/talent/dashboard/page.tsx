/**
 * Talent Dashboard -- Manage digital likeness and incoming approvals.
 *
 * Layout (Figma):
 * - Top nav: FL logo (black square) + tabs (Dashboard, My Face, Licenses, Usage, Settings) + user avatar + logout
 * - 3-column grid (col-span-3 / col-span-6 / col-span-3)
 *   LEFT: My Face Profile, License Terms, Edit/Upload buttons, Connected Accounts
 *   CENTER: Onboarding banner, License Passports, License prefs, Incoming Requests
 *   RIGHT: Active Licenses, Revenue, Pending, Face Identity Certificate, AI Chat
 *
 * Accessible at: /talent/dashboard (requires talent role)
 */
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  User,
  CheckCircle,
  XCircle,
  Instagram,
  Shield,
  Upload,
  Edit3,
  ExternalLink,
  LogOut,
  MessageCircle,
  Send,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  getTalent,
  listTalents,
  updateTalentPreferences,
  getTalentRequests,
  approveLicense,
  getWatermarkByTalent,
} from "@/lib/api";

/* ---------- Types ---------- */

interface TalentProfileData {
  id: number;
  user_id: number;
  name: string;
  email: string;
  bio: string | null;
  photo_url: string | null;
  categories: string | null;
  restricted_categories: string | null;
  approval_mode: string;
  geo_scope: string;
  min_price_per_use: number;
  [key: string]: unknown;
}

interface LicenseRequestData {
  id: number;
  status: string;
  brand_name?: string;
  client_name?: string;
  use_case: string;
  content_type: string;
  license_type: string | null;
  desired_duration_days: number;
  desired_regions: string | null;
  proposed_price: number | null;
  risk_score: string | null;
  created_at: string;
}

interface WatermarkEntry {
  id: number;
  license_id: number;
  [key: string]: unknown;
}

/* ---------- Constants ---------- */

const AD_CATEGORIES = [
  "Fashion",
  "Beauty",
  "Technology",
  "Travel",
  "Auto",
  "Finance",
  "Health",
  "Other",
];

const NAV_TABS = ["Dashboard", "My Face", "Licenses", "Usage", "Settings"];

/* ---------- Component ---------- */

export default function TalentDashboardPage() {
  const { user, logout, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<TalentProfileData | null>(null);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [approvalMode, setApprovalMode] = useState("manual");
  const [geoScope, setGeoScope] = useState("global");
  const [aiRights, setAiRights] = useState("clothing_only");
  const [exclusivity, setExclusivity] = useState("exclusive");
  const [requests, setRequests] = useState<LicenseRequestData[]>([]);
  const [watermarks, setWatermarks] = useState<WatermarkEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [hasPaymentMethod, setHasPaymentMethod] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState({
    accountNumber: "****1234",
    name: "",
    bankName: "",
  });
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState("");

  /* --- Bootstrap data --- */

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "talent")) {
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
      const talents: TalentProfileData[] = await listTalents();
      const match = talents.find((t) => t.user_id === user?.user_id);
      if (match) {
        await loadData(match.id);
      }
    } catch {
      // Profile may not exist yet
    }
  };

  const loadData = async (profileId: number) => {
    try {
      const [p, r] = await Promise.all([
        getTalent(profileId),
        getTalentRequests(profileId),
      ]);
      setProfile(p);
      setAllowed((p.categories || "").split(",").filter(Boolean));
      setBlocked((p.restricted_categories || "").split(",").filter(Boolean));
      setApprovalMode(p.approval_mode || "manual");
      setGeoScope(p.geo_scope || "global");
      setRequests(r);

      try {
        const w = await getWatermarkByTalent(profileId);
        setWatermarks(Array.isArray(w) ? w : []);
      } catch {
        setWatermarks([]);
      }
    } catch {
      // Profile may not exist yet
    }
  };

  /* --- Category toggle (allowed <-> blocked) --- */

  const toggleCategory = (cat: string) => {
    if (allowed.includes(cat)) {
      setAllowed(allowed.filter((c) => c !== cat));
      setBlocked([...blocked, cat]);
    } else if (blocked.includes(cat)) {
      setBlocked(blocked.filter((c) => c !== cat));
    } else {
      setAllowed([...allowed, cat]);
    }
  };

  /* --- Save preferences --- */

  const handleSave = async () => {
    const profileId = profile?.id ?? user?.profile_id;
    if (!profileId) return;
    setSaving(true);
    try {
      await updateTalentPreferences(profileId, {
        categories: allowed.join(","),
        restricted_categories: blocked.join(","),
        approval_mode: approvalMode,
        geo_scope: geoScope,
      });
      setMessage("Preferences saved!");
      setTimeout(() => setMessage(""), 3000);
    } catch {
      setMessage("Failed to save preferences.");
    }
    setSaving(false);
  };

  /* --- Approve / Reject --- */

  const handleRequestAction = async (id: number, approved: boolean) => {
    try {
      await approveLicense(id, approved);
      const profileId = profile?.id ?? user?.profile_id;
      if (profileId) loadData(profileId);
    } catch {
      setMessage("Action failed. Please try again.");
    }
  };

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  /* --- Derived stats --- */

  const activeLicenses = requests.filter(
    (r) => r.status === "active" || r.status === "approved"
  );
  const totalRevenue = activeLicenses.reduce(
    (sum, r) => sum + (r.proposed_price ?? 0),
    0
  );
  const pendingRequests = requests.filter(
    (r) => r.status === "pending" || r.status === "awaiting_approval"
  );

  /* --- Toggle helper --- */

  const Toggle = ({
    enabled,
    onToggle,
  }: {
    enabled: boolean;
    onToggle: () => void;
  }) => (
    <button
      onClick={onToggle}
      className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
        enabled ? "bg-black" : "bg-gray-300"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
          enabled ? "translate-x-5" : ""
        }`}
      />
    </button>
  );

  /* --- Loading state --- */

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-black border-t-transparent" />
      </div>
    );
  }

  /* --- Render --- */

  return (
    <div className="min-h-screen bg-white">
      {/* ===== Top Nav Bar ===== */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between h-14">
          {/* Left: Logo + Tabs */}
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
                <span className="text-white text-xs font-bold">FL</span>
              </div>
            </Link>
            <div className="hidden md:flex items-center gap-1">
              {NAV_TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-4 text-sm transition-colors relative ${
                    activeTab === tab
                      ? "text-black font-medium"
                      : "text-gray-500 hover:text-black"
                  }`}
                >
                  {tab}
                  {activeTab === tab && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-black" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Right: User avatar + logout */}
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
        {/* Toast message */}
        {message && (
          <div className="mb-6 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
            {message}
          </div>
        )}

        {/* ===== 3-column grid ===== */}
        <div className="grid grid-cols-12 gap-6">
          {/* ===== LEFT COLUMN (col-span-3) ===== */}
          <div className="col-span-12 lg:col-span-3 space-y-6">
            {/* My Face Profile */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                My Face Profile
              </h3>

              {/* Profile Photo */}
              <div className="mb-4">
                {profile?.photo_url ? (
                  <img
                    src={profile.photo_url}
                    alt={profile.name}
                    className="w-full aspect-square rounded-lg object-cover border border-gray-200"
                  />
                ) : (
                  <div className="w-full aspect-square rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center">
                    <User className="w-16 h-16 text-gray-400" />
                  </div>
                )}
              </div>

              {/* Name + Tags */}
              <div className="mb-4">
                <p className="text-base font-semibold text-gray-900">
                  {profile?.name || user?.name || "---"}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {allowed.length > 0 ? (
                    allowed.slice(0, 3).map((cat) => (
                      <span
                        key={cat}
                        className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
                      >
                        {cat}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      No categories
                    </span>
                  )}
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900 text-white font-medium">
                    Verified
                  </span>
                </div>
              </div>

              {/* License Terms */}
              <div className="mb-5 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  License Terms
                </p>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-gray-900 block">Regions</span>
                    <span className="text-xs text-gray-500 capitalize">
                      {geoScope}
                    </span>
                  </div>
                  <Toggle
                    enabled={geoScope === "global"}
                    onToggle={() =>
                      setGeoScope(geoScope === "global" ? "uk" : "global")
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-gray-900 block">AI Rights</span>
                    <span className="text-xs text-gray-500">
                      {aiRights === "clothing_only" ? "Clothing only" : "Full"}
                    </span>
                  </div>
                  <Toggle
                    enabled={aiRights === "clothing_only"}
                    onToggle={() =>
                      setAiRights(
                        aiRights === "clothing_only" ? "full" : "clothing_only"
                      )
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-gray-900 block">Exclusivity</span>
                    <span className="text-xs text-gray-500 capitalize">
                      {exclusivity}
                    </span>
                  </div>
                  <Toggle
                    enabled={exclusivity === "exclusive"}
                    onToggle={() =>
                      setExclusivity(
                        exclusivity === "exclusive"
                          ? "non_exclusive"
                          : "exclusive"
                      )
                    }
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 mb-5">
                <button className="w-full flex items-center justify-center gap-2 bg-black text-white py-2 px-4 rounded-lg text-sm hover:bg-gray-800 transition-colors">
                  <Edit3 className="w-3.5 h-3.5" /> Edit Profile
                </button>
                <button className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-900 py-2 px-4 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                  <Upload className="w-3.5 h-3.5" /> Upload Images
                </button>
              </div>

              {/* Connected Accounts */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Connected Accounts
                </p>
                <div className="space-y-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-500">
                      <Instagram className="w-4 h-4" />
                      <span>Instagram</span>
                    </div>
                    <span className="text-gray-900 text-xs truncate max-w-[140px]">
                      {(profile as { instagram?: string } | null)?.instagram || "— not linked"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-500">
                      <ExternalLink className="w-4 h-4" />
                      <span>TikTok</span>
                    </div>
                    <span className="text-gray-900 text-xs truncate max-w-[140px]">
                      {(profile as { tiktok?: string } | null)?.tiktok || "— not linked"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-500">
                      <ExternalLink className="w-4 h-4" />
                      <span>YouTube</span>
                    </div>
                    <span className="text-gray-900 text-xs truncate max-w-[140px]">
                      {(profile as { youtube?: string } | null)?.youtube || "— not linked"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-500">
                      <Shield className="w-4 h-4" />
                      <span>Agent</span>
                    </div>
                    <span className="text-gray-900 text-xs truncate max-w-[140px]">
                      {(profile as { linked_agent?: { agency_name?: string } } | null)?.linked_agent?.agency_name || "— none"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ===== CENTER COLUMN (col-span-6) ===== */}
          <div className="col-span-12 lg:col-span-6 space-y-6">
            {/* Onboarding Banner */}
            {!profile && (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  Complete Your Profile
                </h3>
                <p className="text-xs text-gray-500 mb-4">
                  Complete these steps to start receiving license requests.
                </p>
                <div className="space-y-3">
                  {["Upload profile photo", "Set license preferences", "Connect social accounts", "Verify identity"].map(
                    (step, i) => (
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
                    )
                  )}
                </div>
              </div>
            )}

            {/* License Passports */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">
                License Passports
              </h3>
              <p className="text-xs text-gray-500 mb-5">Allowed Campaigns</p>

              {/* Category grid */}
              <div className="grid grid-cols-2 gap-2.5 mb-6">
                {AD_CATEGORIES.map((cat) => {
                  const isAllowed = allowed.includes(cat);
                  const isBlocked = blocked.includes(cat);
                  return (
                    <button
                      key={cat}
                      onClick={() => toggleCategory(cat)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors text-left ${
                        isBlocked
                          ? "border-red-300 bg-red-50"
                          : isAllowed
                          ? "border-green-300 bg-green-50"
                          : "border-gray-200 bg-white hover:bg-gray-50"
                      }`}
                    >
                      <span
                        className={`flex-shrink-0 w-4 h-4 rounded flex items-center justify-center ${
                          isBlocked
                            ? "bg-red-200"
                            : isAllowed
                            ? "bg-green-200"
                            : "bg-gray-200"
                        }`}
                      >
                        {isAllowed && (
                          <CheckCircle className="w-3 h-3 text-green-700" />
                        )}
                        {isBlocked && (
                          <XCircle className="w-3 h-3 text-red-700" />
                        )}
                      </span>
                      <span
                        className={`text-xs ${
                          isBlocked
                            ? "line-through text-gray-500"
                            : "text-gray-900"
                        }`}
                      >
                        {cat}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Min price */}
              <div className="border-t border-gray-200 pt-4 mb-5">
                <p className="text-xs text-gray-500 mb-1">
                  Minimum price per use
                </p>
                <p className="text-xl font-bold text-gray-900">
                  {"\u00A3"}{profile?.min_price_per_use?.toLocaleString() ?? "0"}
                </p>
              </div>

              {/* Auto-approve toggle */}
              <div className="flex items-center justify-between mb-5">
                <div>
                  <span className="text-sm text-gray-900 block">
                    Auto-Approve
                  </span>
                  <span className="text-xs text-gray-500">
                    Automatically approve matching requests
                  </span>
                </div>
                <Toggle
                  enabled={approvalMode === "auto"}
                  onToggle={() =>
                    setApprovalMode(
                      approvalMode === "auto" ? "manual" : "auto"
                    )
                  }
                />
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full bg-black text-white py-2 px-4 rounded-lg text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Preferences"}
              </button>

              <p className="text-xs text-gray-400 text-center mt-2">
                Click a category to cycle: allowed &rarr; blocked &rarr; off
              </p>
            </div>

            {/* Incoming License Requests */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-5">
                Incoming License Requests
              </h3>

              {requests.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No incoming requests yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2.5 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Client
                        </th>
                        <th className="text-left py-2.5 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Use Case
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
                              {r.client_name || r.brand_name || "Unknown"}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-gray-500 text-xs max-w-[160px] truncate">
                            {r.use_case}
                          </td>
                          <td className="py-3 pr-4">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                                (r.license_type || "standard") === "exclusive"
                                  ? "bg-purple-50 text-purple-700"
                                  : (r.license_type || "standard") ===
                                    "time_limited"
                                  ? "bg-blue-50 text-blue-700"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {(
                                r.license_type ||
                                r.content_type ||
                                "standard"
                              ).replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-xs font-medium text-gray-900">
                            {r.proposed_price != null
                              ? `\u00A3${r.proposed_price.toLocaleString()}`
                              : "---"}
                          </td>
                          <td className="py-3 pr-4">
                            <span
                              className={`text-xs px-2.5 py-1 rounded-full capitalize font-medium ${
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
                                r.status === "pending" ||
                                r.status === "under_review") && (
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
                                    className="flex items-center gap-1 text-xs font-medium bg-red-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-red-700 transition-colors"
                                  >
                                    <XCircle className="h-3 w-3" /> Reject
                                  </button>
                                </>
                              )}
                              <Link
                                href={`/license/${r.id}`}
                                className="text-xs text-gray-500 hover:text-gray-900 hover:underline ml-1"
                              >
                                View
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* ===== RIGHT COLUMN (col-span-3) ===== */}
          <div className="col-span-12 lg:col-span-3 space-y-6">
            {/* Active Licenses */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">
                  Active Licenses
                </h3>
                <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {activeLicenses.length}
                </span>
              </div>

              {activeLicenses.length > 0 ? (
                <div className="space-y-3 mb-5">
                  {activeLicenses.slice(0, 3).map((lic) => (
                    <div
                      key={lic.id}
                      className="rounded-lg border border-gray-200 p-3"
                    >
                      <p className="text-sm font-medium text-gray-900">
                        {lic.brand_name}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {(lic.license_type || lic.content_type || "standard").replace(/_/g, " ")} &middot;{" "}
                        {lic.desired_duration_days} days &middot;{" "}
                        {lic.desired_regions || "Global"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 mb-5">
                  No active licenses yet.
                </p>
              )}

              {/* Revenue */}
              <div className="text-center py-4 rounded-lg bg-gray-50 border border-gray-200 mb-4">
                <p className="text-3xl font-bold text-gray-900">
                  {"\u00A3"}{totalRevenue.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 mt-1">Total Revenue</p>
              </div>

              {/* Pending count */}
              <div className="flex items-center justify-between text-sm py-2 border-b border-gray-100">
                <span className="text-gray-500">Pending Requests</span>
                <span className="font-medium bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full text-xs">
                  {pendingRequests.length}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm py-2">
                <span className="text-gray-500">Watermarks Tracked</span>
                <span className="font-medium text-gray-900 text-xs">
                  {watermarks.length}
                </span>
              </div>
            </div>

            {/* Face Identity Certificate */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Face Identity Certificate
              </h3>
              {profile ? (
                <div className="rounded-lg bg-gradient-to-br from-gray-900 to-black p-5 text-white">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
                      <Shield className="w-5 h-5 text-green-400" />
                    </div>
                    <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-1 rounded-full uppercase tracking-wider font-semibold">
                      Verified
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Face ID</p>
                  <p className="font-mono text-sm font-semibold mb-4">
                    FL-{String(profile.id).padStart(6, "0")}
                  </p>
                  <p className="text-[10px] text-gray-500">
                    Issued by Face Library &bull; UK GDPR Compliant
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border-2 border-dashed border-gray-200 p-6 flex flex-col items-center justify-center text-center">
                  <Shield className="w-8 h-8 text-gray-400 mb-2" />
                  <p className="text-xs text-gray-500">
                    Your verified identity certificate will appear here once approved.
                  </p>
                </div>
              )}
            </div>

            {/* Payment Method */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">
                  Payment Method
                </h3>
                <button
                  onClick={() => setShowPaymentModal(true)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  {hasPaymentMethod ? "Edit" : "Add"}
                </button>
              </div>
              {hasPaymentMethod ? (
                <div className="border border-gray-200 rounded-lg p-3 mb-4">
                  <p className="text-xs text-gray-500 mb-1">Bank Account</p>
                  <p className="text-sm font-medium text-gray-900">{paymentMethod.bankName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{paymentMethod.accountNumber}</p>
                </div>
              ) : (
                <p className="text-xs text-gray-500 mb-4">
                  No payment method set. Add one to receive earnings.
                </p>
              )}
              <Link
                href="/talent/earnings"
                className="block text-center text-xs bg-black text-white py-2 rounded-lg hover:bg-gray-800 transition-colors"
              >
                View Earnings &amp; Payouts →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Method Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Payment Method</h3>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-gray-500 hover:text-black"
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setHasPaymentMethod(true);
                setShowPaymentModal(false);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Account Holder Name</label>
                <input
                  type="text"
                  value={paymentMethod.name}
                  onChange={(e) => setPaymentMethod({ ...paymentMethod, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="Full name"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Bank Name</label>
                <input
                  type="text"
                  value={paymentMethod.bankName}
                  onChange={(e) => setPaymentMethod({ ...paymentMethod, bankName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="e.g. Barclays Bank"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Account Number (last 4 digits)</label>
                <input
                  type="text"
                  value={paymentMethod.accountNumber}
                  onChange={(e) => setPaymentMethod({ ...paymentMethod, accountNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="****1234"
                  required
                />
              </div>
              <p className="text-[11px] text-gray-500">
                Bank details are encrypted and only used for payouts. 90% of each licensing fee goes directly to you.
              </p>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-black text-white py-2 rounded-lg text-sm hover:bg-gray-800 transition-colors"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== AI Chat Widget (floating) ===== */}
      <div className="fixed bottom-6 right-6 z-50">
        {chatOpen && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-lg w-80 mb-3 overflow-hidden">
            <div className="bg-black text-white px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-medium">AI Assistant</span>
              <button
                onClick={() => setChatOpen(false)}
                className="text-white/70 hover:text-white text-xs"
              >
                Close
              </button>
            </div>
            <div className="p-4 h-64 overflow-y-auto">
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 mb-3">
                Hi! I can help you manage your Face Library profile. Ask me about
                license terms, pricing, or campaign categories.
              </div>
            </div>
            <div className="border-t border-gray-200 p-3 flex items-center gap-2">
              <input
                type="text"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder="Type a message..."
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
              />
              <button className="bg-black text-white p-2 rounded-lg hover:bg-gray-800 transition-colors">
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
        <button
          onClick={() => setChatOpen(!chatOpen)}
          className="w-12 h-12 bg-black text-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-800 transition-colors"
        >
          <MessageCircle className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
