"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, CheckCircle, MapPin, Shield } from "lucide-react";
import { createLicenseRequest, getTalent, getTalentPricing, getTalentPortfolio } from "@/lib/api";

// Hero placeholder used only when the talent hasn't uploaded a profile photo.
// Portfolio images now come from /api/talents/:id/portfolio; no more fakes.
const HERO_PLACEHOLDER =
  "https://images.unsplash.com/flagged/photo-1573582677725-863b570e3c00?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=600";

export default function TalentProfilePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const talentId = parseInt(id) || 1;

  const [talent, setTalent] = useState<{
    name: string; image: string; faceId: string; gender: string;
    age: number; location: string; categories: string[];
    regions: string[]; usageAllowed: string[]; bio: string;
    portfolio: string[]; pricing: Record<string, string>;
    min_price: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [licenseForm, setLicenseForm] = useState({
    campaignName: "", usageType: "", duration: "", region: "", details: "",
  });

  useEffect(() => {
    Promise.all([
      getTalent(talentId),
      getTalentPricing(talentId).catch(() => ({} as Record<string, number | null | undefined>)),
      getTalentPortfolio(talentId).catch(() => [] as string[]),
    ])
      .then(([t, realTiers, realPortfolio]) => {
        const cats = (t.categories || "").split(",").filter(Boolean);
        const geo = (t.geo_scope || "global").split(",").filter(Boolean);
        const base = t.min_price_per_use || 500;
        // Prefer operator-set pricing; otherwise derive from min_price_per_use.
        const price = (key: "social" | "website" | "print" | "tv", fallbackMult: number, suffix: string) => {
          const real = (realTiers as Record<string, number | null | undefined>)[key];
          if (typeof real === "number" && real > 0) {
            return `£${real.toLocaleString()}${suffix}`;
          }
          return `£${Math.round(base * fallbackMult).toLocaleString()}${suffix}`;
        };
        setTalent({
          name: t.name || t.stage_name || "Unknown",
          image: t.image_url || t.avatar_url || HERO_PLACEHOLDER,
          faceId: `FL-${String(t.id).padStart(6, "0")}`,
          gender: t.gender || "Not specified",
          age: t.age || 0,
          location: t.nationality ? `${t.nationality}` : "UK",
          categories: cats.length ? cats : ["General"],
          regions: geo,
          usageAllowed: [
            ...(t.allow_image_generation !== false ? ["Image"] : []),
            ...(t.allow_video_generation !== false ? ["Video"] : []),
            ...(t.allow_ai_training ? ["AI Training"] : []),
          ],
          bio: t.bio || "Digital likeness available for licensed campaigns.",
          // Prefer operator-set portfolio; fall back to the profile image only
          // (no more Unsplash stand-ins — empty slots are honest signal).
          portfolio: (Array.isArray(realPortfolio) && realPortfolio.length > 0
            ? realPortfolio.slice(0, 3)
            : t.image_url ? [t.image_url] : []),
          pricing: {
            social: price("social", 1, "/month"),
            website: price("website", 1.6, "/month"),
            print: price("print", 2.4, "/campaign"),
            tv: price("tv", 5, "/campaign"),
          },
          min_price: base,
        });
      })
      .catch(() => {
        setTalent(null);
      })
      .finally(() => setLoading(false));
  }, [talentId]);

  const handleLicenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      await createLicenseRequest({
        talent_id: talentId,
        license_type: "standard",
        use_case: `${licenseForm.campaignName} — ${licenseForm.usageType}. ${licenseForm.details}`,
        desired_duration_days: parseInt(licenseForm.duration) * 30 || 90,
        desired_regions: licenseForm.region,
        content_type: licenseForm.usageType === "tv" ? "video" : "image",
        proposed_price: talent?.min_price || null,
      });
      setShowLicenseModal(false);
      router.push("/client/dashboard");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-black border-t-transparent" />
      </div>
    );
  }

  if (!talent) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Talent not found.</p>
          <Link href="/discover-talent" className="text-black underline hover:no-underline">Browse Talent</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 bg-black text-white flex items-center justify-center text-xs font-bold">FL</div>
            <span className="font-semibold text-base tracking-wide">FACE LIBRARY</span>
          </Link>
          <button onClick={() => router.push("/discover-talent")} className="flex items-center gap-2 text-sm text-gray-600 hover:text-black">
            <ArrowLeft className="w-4 h-4" /> Back to Discovery
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="grid grid-cols-3 gap-8 mb-10">
          <div className="col-span-1">
            <div className="relative aspect-[3/4] bg-white rounded-xl overflow-hidden border border-gray-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={talent.image} alt={talent.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-white/20 text-3xl font-bold tracking-wider -rotate-12">FACE LIBRARY</div>
              </div>
            </div>
          </div>

          <div className="col-span-2">
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-4xl font-bold">{talent.name}</h1>
                <CheckCircle className="w-7 h-7 text-green-600" />
              </div>
              <div className="flex items-center gap-4 text-gray-600 mb-4">
                <span className="flex items-center gap-2"><MapPin className="w-4 h-4" />{talent.location}</span>
                <span>&bull;</span><span>{talent.gender}</span>
                <span>&bull;</span><span>{talent.age} years</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Shield className="w-4 h-4" /> Face ID: {talent.faceId}
              </div>
            </div>

            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-2">About</h2>
              <p className="text-gray-700 leading-relaxed">{talent.bio}</p>
            </div>

            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-3">Categories</h2>
              <div className="flex flex-wrap gap-2">
                {talent.categories.map((c) => <span key={c} className="px-4 py-2 bg-gray-100 rounded-full text-sm font-medium">{c}</span>)}
              </div>
            </div>

            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-3">Available Regions</h2>
              <div className="flex flex-wrap gap-2">
                {talent.regions.map((r) => <span key={r} className="px-4 py-2 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">{r}</span>)}
              </div>
            </div>

            <div className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Usage Allowed</h2>
              <div className="flex flex-wrap gap-2">
                {talent.usageAllowed.map((u) => <span key={u} className="px-4 py-2 bg-green-50 text-green-700 rounded-full text-sm font-medium">{u}</span>)}
              </div>
            </div>

            <button onClick={() => setShowLicenseModal(true)} className="w-full bg-black text-white py-4 rounded-xl text-lg font-semibold hover:bg-gray-800 transition-colors">
              Select Talent
            </button>
          </div>
        </div>

        <div className="mb-10">
          <h2 className="text-2xl font-semibold mb-6">Portfolio</h2>
          {talent.portfolio.length === 0 ? (
            <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl py-12 text-center text-sm text-gray-500">
              No portfolio images yet. The talent hasn&apos;t published any showcase
              photos.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {talent.portfolio.map((img, i) => (
                <div key={i} className="relative aspect-[3/4] bg-white rounded-xl overflow-hidden border border-gray-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img} alt={`Portfolio ${i + 1}`} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-white/20 text-2xl font-bold tracking-wider -rotate-12">FACE LIBRARY</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-gray-50 rounded-xl p-8">
          <h2 className="text-2xl font-semibold mb-6">Licensing Pricing</h2>
          <div className="grid grid-cols-4 gap-6">
            {Object.entries(talent.pricing).map(([key, val]) => (
              <div key={key} className="bg-white rounded-xl p-6 border border-gray-200">
                <p className="text-sm text-gray-600 mb-2 capitalize">{key}</p>
                <p className="text-2xl font-bold">{val}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {showLicenseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold">License Request</h2>
              <button onClick={() => setShowLicenseModal(false)} className="text-gray-500 hover:text-black">&times;</button>
            </div>
            <div className="flex items-center gap-4 mb-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={talent.image} alt={talent.name} className="w-16 h-16 rounded-full object-cover" />
              <div>
                <h3 className="font-semibold text-lg">{talent.name}</h3>
                <p className="text-sm text-gray-600">Face ID: {talent.faceId}</p>
              </div>
            </div>
            <form onSubmit={handleLicenseSubmit}>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-2">Campaign Name</label>
                  <input type="text" placeholder="e.g., Summer Beauty Campaign 2026" required value={licenseForm.campaignName} onChange={(e) => setLicenseForm({ ...licenseForm, campaignName: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Usage Type</label>
                  <select required value={licenseForm.usageType} onChange={(e) => setLicenseForm({ ...licenseForm, usageType: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black">
                    <option value="">Select usage type</option>
                    <option value="social">Social Media</option>
                    <option value="website">Website</option>
                    <option value="print">Print</option>
                    <option value="tv">TV Commercial</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Duration</label>
                    <select required value={licenseForm.duration} onChange={(e) => setLicenseForm({ ...licenseForm, duration: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black">
                      <option value="">Select</option>
                      <option value="1">1 month</option>
                      <option value="3">3 months</option>
                      <option value="6">6 months</option>
                      <option value="12">12 months</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Region</label>
                    <select required value={licenseForm.region} onChange={(e) => setLicenseForm({ ...licenseForm, region: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black">
                      <option value="">Select</option>
                      <option value="Global">Global</option>
                      <option value="UK">UK</option>
                      <option value="Europe">Europe</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Additional Details</label>
                  <textarea placeholder="Describe your campaign..." rows={3} value={licenseForm.details} onChange={(e) => setLicenseForm({ ...licenseForm, details: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black resize-none" />
                </div>
                {submitError && <p className="text-sm text-red-600">{submitError}</p>}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowLicenseModal(false)} className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-lg hover:border-black hover:text-black transition-colors font-medium">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 bg-black text-white py-3 rounded-lg hover:bg-gray-800 transition-colors font-medium disabled:opacity-50">
                  {submitting ? "Submitting..." : "Submit License Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
