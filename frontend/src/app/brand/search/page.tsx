"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search, ArrowRight, Users } from "lucide-react";
import { listTalents, searchTalent, createLicenseRequest, processLicense } from "@/lib/api";

interface Talent {
  id: number;
  name: string;
  bio: string;
  categories: string;
  min_price_per_use: number;
  allow_video_generation: boolean;
  allow_image_generation: boolean;
}

export default function BrandSearchPage() {
  const [talents, setTalents] = useState<Talent[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<Record<string, unknown> | null>(null);
  const [processing, setProcessing] = useState<number | null>(null);
  const [pipelineResult, setPipelineResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    listTalents().then(setTalents).catch(() => {});
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const result = await searchTalent(query);
      setSearchResult(result);
    } catch {
      setSearchResult(null);
    } finally {
      setSearching(false);
    }
  };

  const handleLicenseRequest = async (talentId: number) => {
    setProcessing(talentId);
    try {
      // Create license request (using brand_id=1 as demo)
      const license = await createLicenseRequest({
        brand_id: 1,
        talent_id: talentId,
        use_case: query || "AI-generated marketing campaign",
        campaign_description: "Digital advertising campaign using AI-generated likeness",
        desired_duration_days: 30,
        desired_regions: "UK, EU",
        content_type: "image",
        exclusivity: false,
      });

      // Process through agent pipeline
      const result = await processLicense(license.id as number);
      setPipelineResult(result);
    } catch (err) {
      console.error(err);
    } finally {
      setProcessing(null);
    }
  };

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
          <Link href="/" className="flex items-center gap-2 font-body text-sm text-[#6B6B73] hover:text-[#0B0B0F] transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-8 py-16">
        <div className="mb-10">
          <p className="font-body text-xs tracking-[0.25em] uppercase text-[#1E3A5F] mb-3">
            AI-Powered Discovery
          </p>
          <h1 className="font-display text-4xl font-light text-[#0B0B0F] leading-tight">
            Find the perfect <span className="italic">talent</span>
          </h1>
        </div>

        {/* Search Bar */}
        <div className="flex gap-3 mb-10">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6B73]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Describe your campaign — e.g. 'fashion model for luxury brand campaign in Europe'"
              className="w-full bg-white border border-[#E0E0DA] rounded-md pl-11 pr-4 py-3.5 font-body text-sm text-[#0B0B0F] focus:outline-none focus:border-[#1E3A5F] transition-colors"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching}
            className="bg-[#0B0B0F] text-[#FAFAF8] font-body text-sm font-medium px-6 rounded-md hover:bg-[#1E3A5F] transition-colors disabled:opacity-50"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </div>

        {/* Search Results (AI) */}
        {searchResult && (
          <div className="mb-10 bg-white border border-[#1E3A5F]/20 rounded-lg p-6">
            <p className="font-body text-xs tracking-[0.15em] uppercase text-[#1E3A5F] mb-3">
              AI Search Results
            </p>
            <pre className="font-body text-xs text-[#6B6B73] whitespace-pre-wrap overflow-auto max-h-64">
              {JSON.stringify(searchResult.result || searchResult, null, 2)}
            </pre>
          </div>
        )}

        {/* Pipeline Result */}
        {pipelineResult && (
          <div className="mb-10 bg-[#0B0B0F] text-[#FAFAF8] rounded-lg p-6">
            <p className="font-body text-xs tracking-[0.15em] uppercase text-[#FAFAF8]/40 mb-3">
              Agent Pipeline Complete
            </p>
            <p className="font-body text-sm mb-2">
              License #{String((pipelineResult as Record<string, unknown>).license_id)} — Status: <strong>{String((pipelineResult as Record<string, unknown>).status)}</strong>
            </p>
            <Link
              href={`/license/${String((pipelineResult as Record<string, unknown>).license_id)}`}
              className="inline-flex items-center gap-2 text-[#FAFAF8] font-body text-sm underline underline-offset-4"
            >
              View License Details <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {/* Talent List */}
        <div>
          <div className="flex items-center gap-2 mb-6">
            <Users className="w-4 h-4 text-[#6B6B73]" />
            <span className="font-body text-xs tracking-[0.15em] uppercase text-[#6B6B73]">
              Available Talent ({talents.length})
            </span>
          </div>
          {talents.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-lg border border-[#E0E0DA]">
              <p className="font-body text-[#6B6B73]">No talent registered yet. Register some talent first.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {talents.map((t) => (
                <div key={t.id} className="bg-white border border-[#E0E0DA] rounded-lg p-6 card-lift hover:border-[#1E3A5F]/30 transition-colors">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-display text-xl text-[#0B0B0F]">{t.name}</h3>
                      <p className="font-body text-xs text-[#6B6B73] mt-1">{t.bio || "No bio provided"}</p>
                      <div className="flex gap-4 mt-3">
                        <span className="font-body text-xs text-[#1E3A5F]">From £{t.min_price_per_use}/use</span>
                        {t.allow_image_generation && <span className="font-body text-xs text-[#6B6B73]">Image</span>}
                        {t.allow_video_generation && <span className="font-body text-xs text-[#6B6B73]">Video</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => handleLicenseRequest(t.id)}
                      disabled={processing === t.id}
                      className="shrink-0 inline-flex items-center gap-2 bg-[#0B0B0F] text-[#FAFAF8] font-body text-xs font-medium py-2.5 px-5 rounded-md hover:bg-[#1E3A5F] transition-colors disabled:opacity-50"
                    >
                      {processing === t.id ? "Processing..." : "Request License"}
                      <ArrowRight className="w-3 h-3" />
                    </button>
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
