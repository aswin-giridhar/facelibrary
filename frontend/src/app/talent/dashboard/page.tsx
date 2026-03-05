"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, MapPin, Shield, CheckCircle, XCircle } from "lucide-react";
import DashboardNav from "@/components/DashboardNav";
import { useAuth } from "@/lib/auth";
import { getTalent, updateTalentPreferences, getTalentRequests, approveLicense } from "@/lib/api";

interface TalentProfileData {
  name: string;
  email: string;
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
  brand_name: string;
  use_case: string;
  content_type: string;
  desired_duration_days: number;
  desired_regions: string | null;
  proposed_price: number | null;
  risk_score: string | null;
  created_at: string;
}

const AD_CATEGORIES = [
  "Fashion", "Beauty", "Technology", "Automotive", "Food & Beverage",
  "Healthcare", "Finance", "Entertainment", "Sports", "Travel",
  "Real Estate", "Education", "Gaming", "Alcohol", "Gambling",
];

export default function TalentDashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<TalentProfileData | null>(null);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [approvalMode, setApprovalMode] = useState("manual");
  const [geoScope, setGeoScope] = useState("global");
  const [requests, setRequests] = useState<LicenseRequestData[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "talent")) {
      router.push("/login");
      return;
    }
    if (user?.profile_id) {
      loadData(user.profile_id);
    }
  }, [user, authLoading]);

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
    } catch {
      // Profile may not exist yet
    }
  };

  const toggleCategory = (cat: string) => {
    if (blocked.includes(cat)) {
      setBlocked(blocked.filter((c) => c !== cat));
      setAllowed([...allowed, cat]);
    } else if (allowed.includes(cat)) {
      setAllowed(allowed.filter((c) => c !== cat));
      setBlocked([...blocked, cat]);
    } else {
      setAllowed([...allowed, cat]);
    }
  };

  const handleSave = async () => {
    if (!user?.profile_id) return;
    setSaving(true);
    try {
      await updateTalentPreferences(user.profile_id, {
        categories: allowed.join(","),
        restricted_categories: blocked.join(","),
        approval_mode: approvalMode,
        geo_scope: geoScope,
      });
      setMessage("Preferences saved!");
      setTimeout(() => setMessage(""), 3000);
    } catch {
      setMessage("Failed to save");
    }
    setSaving(false);
  };

  const handleRequestAction = async (id: number, approved: boolean) => {
    try {
      await approveLicense(id, approved);
      if (user?.profile_id) loadData(user.profile_id);
    } catch {
      // error
    }
  };

  if (authLoading) {
    return <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1E3A5F] border-t-transparent" /></div>;
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <DashboardNav />

      <div className="max-w-6xl mx-auto px-8 lg:px-16 py-10">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold text-[#0B0B0F]">Talent Dashboard</h1>
          <p className="font-body text-sm text-[#6B6B73]">Manage your likeness licensing preferences</p>
        </div>

        {message && (
          <div className="mb-6 p-3 rounded-md bg-green-50 border border-green-200 text-green-700 font-body text-sm">
            {message}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3 mb-8">
          {/* Profile */}
          <div className="bg-white border border-[#E0E0DA] rounded-lg p-6">
            <h3 className="font-body text-sm font-medium text-[#0B0B0F] flex items-center gap-2 mb-4">
              <User className="h-4 w-4" /> Profile
            </h3>
            <div className="space-y-2 font-body text-sm">
              <div><span className="text-[#6B6B73]">Name:</span> <span className="font-medium">{profile?.name}</span></div>
              <div><span className="text-[#6B6B73]">Email:</span> <span>{profile?.email}</span></div>
              <div className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-[#6B6B73]" /><span className="capitalize">{geoScope} scope</span></div>
            </div>
          </div>

          {/* Approval Settings */}
          <div className="bg-white border border-[#E0E0DA] rounded-lg p-6">
            <h3 className="font-body text-sm font-medium text-[#0B0B0F] mb-4">Approval Settings</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-body text-sm text-[#0B0B0F]">Auto-Approve Requests</span>
                <button
                  onClick={() => setApprovalMode(approvalMode === "auto" ? "manual" : "auto")}
                  className={`relative w-11 h-6 rounded-full transition-colors ${approvalMode === "auto" ? "bg-[#1E3A5F]" : "bg-[#E0E0DA]"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${approvalMode === "auto" ? "translate-x-5" : ""}`} />
                </button>
              </div>
              <div>
                <span className="font-body text-sm text-[#0B0B0F] block mb-1">Geographic Scope</span>
                <select
                  value={geoScope}
                  onChange={(e) => setGeoScope(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E0E0DA] rounded-md font-body text-sm bg-white"
                >
                  <option value="uk">UK Only</option>
                  <option value="eu">EU</option>
                  <option value="global">Global</option>
                </select>
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full bg-[#0B0B0F] text-[#FAFAF8] font-body text-sm font-medium py-2.5 rounded-md hover:bg-[#1E3A5F] transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Preferences"}
              </button>
            </div>
          </div>

          {/* Linked Agent */}
          <div className="bg-white border border-[#E0E0DA] rounded-lg p-6">
            <h3 className="font-body text-sm font-medium text-[#0B0B0F] flex items-center gap-2 mb-4">
              <Shield className="h-4 w-4" /> Linked Agent
            </h3>
            <p className="font-body text-sm text-[#6B6B73]">No agent linked yet.</p>
          </div>
        </div>

        {/* Ad Category Permissions */}
        <div className="bg-white border border-[#E0E0DA] rounded-lg p-6 mb-8">
          <h3 className="font-body text-sm font-medium text-[#0B0B0F] mb-4">Ad Category Permissions</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {AD_CATEGORIES.map((cat) => {
              const isAllowed = allowed.includes(cat);
              const isBlocked = blocked.includes(cat);
              return (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={`flex items-center gap-2 rounded-lg border p-3 text-sm font-body transition-colors text-left ${
                    isBlocked
                      ? "border-red-300 bg-red-50"
                      : isAllowed
                      ? "border-[#1E3A5F]/30 bg-[#1E3A5F]/5"
                      : "border-[#E0E0DA]"
                  }`}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                    isAllowed ? "bg-[#1E3A5F] border-[#1E3A5F]" : isBlocked ? "bg-red-500 border-red-500" : "border-[#E0E0DA]"
                  }`}>
                    {isAllowed && <CheckCircle className="w-3 h-3 text-white" />}
                    {isBlocked && <XCircle className="w-3 h-3 text-white" />}
                  </div>
                  <span className={isBlocked ? "line-through text-[#6B6B73]" : ""}>{cat}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 font-body text-xs text-[#6B6B73]">Click to toggle: allowed (blue) / blocked (red) / neutral.</p>
          <button onClick={handleSave} disabled={saving} className="mt-4 bg-[#0B0B0F] text-[#FAFAF8] font-body text-sm font-medium py-2 px-6 rounded-md hover:bg-[#1E3A5F] transition-colors disabled:opacity-50">
            Save
          </button>
        </div>

        {/* Incoming Requests */}
        <div className="bg-white border border-[#E0E0DA] rounded-lg p-6">
          <h3 className="font-body text-sm font-medium text-[#0B0B0F] mb-4">Incoming License Requests</h3>
          {requests.length === 0 ? (
            <p className="font-body text-sm text-[#6B6B73]">No incoming requests yet.</p>
          ) : (
            <div className="space-y-3">
              {requests.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg border border-[#E0E0DA] p-4">
                  <div className="space-y-1">
                    <p className="font-body text-sm font-medium text-[#0B0B0F]">{r.brand_name}</p>
                    <p className="font-body text-xs text-[#6B6B73]">
                      {r.content_type} &middot; {r.desired_duration_days} days &middot; {r.desired_regions || "Global"}
                    </p>
                    {r.proposed_price != null && <p className="font-body text-xs text-[#6B6B73]">Price: ${r.proposed_price}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-body text-xs px-3 py-1 rounded-full capitalize ${
                      r.status === "active" || r.status === "approved" ? "bg-green-50 text-green-700" :
                      r.status === "rejected" ? "bg-red-50 text-red-700" :
                      "bg-[#F5F5F0] text-[#6B6B73]"
                    }`}>
                      {r.status}
                    </span>
                    {(r.status === "awaiting_approval" || r.status === "pending") && (
                      <>
                        <button
                          onClick={() => handleRequestAction(r.id, true)}
                          className="flex items-center gap-1 font-body text-xs border border-[#E0E0DA] px-3 py-1.5 rounded-md hover:bg-green-50 transition-colors"
                        >
                          <CheckCircle className="h-3.5 w-3.5 text-green-600" /> Approve
                        </button>
                        <button
                          onClick={() => handleRequestAction(r.id, false)}
                          className="flex items-center gap-1 font-body text-xs text-[#6B6B73] hover:text-red-600 transition-colors"
                        >
                          <XCircle className="h-3.5 w-3.5" /> Reject
                        </button>
                      </>
                    )}
                    <Link href={`/license/${r.id}`} className="font-body text-xs text-[#1E3A5F] hover:underline">
                      View
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
