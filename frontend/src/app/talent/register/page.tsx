"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { registerTalent } from "@/lib/api";

export default function TalentRegisterPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    bio: "",
    categories: "",
    restricted_categories: "",
    min_price_per_use: 100,
    max_license_duration_days: 365,
    allow_ai_training: false,
    allow_video_generation: true,
    allow_image_generation: true,
    geo_restrictions: "",
    portfolio_description: "",
  });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const update = (field: string, value: unknown) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await registerTalent(form);
      setResult(res);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  };

  if (status === "success" && result) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center px-8">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-[#1E3A5F] flex items-center justify-center mx-auto mb-6">
            <Check className="w-8 h-8 text-white" />
          </div>
          <h1 className="font-display text-3xl text-[#0B0B0F] mb-2">Welcome to Face Library</h1>
          <p className="font-body text-[#6B6B73] mb-6">
            Your talent profile has been created. Your ID is <strong>#{String(result.id)}</strong>.
          </p>
          <Link
            href="/talent/dashboard"
            className="inline-flex items-center gap-2 bg-[#0B0B0F] text-[#FAFAF8] font-body text-sm font-medium py-3 px-8 rounded-md hover:bg-[#1E3A5F] transition-colors"
          >
            Go to Dashboard
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Nav */}
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

      <div className="max-w-2xl mx-auto px-8 py-16">
        <div className="mb-10">
          <p className="font-body text-xs tracking-[0.25em] uppercase text-[#1E3A5F] mb-3">
            Talent Registration
          </p>
          <h1 className="font-display text-4xl font-light text-[#0B0B0F] leading-tight">
            Take control of your <span className="italic">likeness</span>
          </h1>
          <p className="font-body text-[#6B6B73] mt-3">
            Set your terms, restrict categories, and let AI agents negotiate on your behalf.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Info */}
          <fieldset className="space-y-4">
            <legend className="font-body text-xs tracking-[0.2em] uppercase text-[#1E3A5F] mb-4">
              Basic Information
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="font-body text-xs text-[#6B6B73] mb-1 block">Full Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  className="w-full bg-white border border-[#E0E0DA] rounded-md px-4 py-3 font-body text-sm text-[#0B0B0F] focus:outline-none focus:border-[#1E3A5F] transition-colors"
                  placeholder="Jane Doe"
                />
              </div>
              <div>
                <label className="font-body text-xs text-[#6B6B73] mb-1 block">Email *</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  className="w-full bg-white border border-[#E0E0DA] rounded-md px-4 py-3 font-body text-sm text-[#0B0B0F] focus:outline-none focus:border-[#1E3A5F] transition-colors"
                  placeholder="jane@example.com"
                />
              </div>
            </div>
            <div>
              <label className="font-body text-xs text-[#6B6B73] mb-1 block">Bio</label>
              <textarea
                value={form.bio}
                onChange={(e) => update("bio", e.target.value)}
                rows={3}
                className="w-full bg-white border border-[#E0E0DA] rounded-md px-4 py-3 font-body text-sm text-[#0B0B0F] focus:outline-none focus:border-[#1E3A5F] transition-colors resize-none"
                placeholder="Tell brands about yourself..."
              />
            </div>
          </fieldset>

          {/* Licensing Preferences */}
          <fieldset className="space-y-4">
            <legend className="font-body text-xs tracking-[0.2em] uppercase text-[#1E3A5F] mb-4">
              Licensing Preferences
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="font-body text-xs text-[#6B6B73] mb-1 block">Minimum Price Per Use (£)</label>
                <input
                  type="number"
                  min={0}
                  value={form.min_price_per_use}
                  onChange={(e) => update("min_price_per_use", Number(e.target.value))}
                  className="w-full bg-white border border-[#E0E0DA] rounded-md px-4 py-3 font-body text-sm text-[#0B0B0F] focus:outline-none focus:border-[#1E3A5F] transition-colors"
                />
              </div>
              <div>
                <label className="font-body text-xs text-[#6B6B73] mb-1 block">Max License Duration (days)</label>
                <input
                  type="number"
                  min={1}
                  value={form.max_license_duration_days}
                  onChange={(e) => update("max_license_duration_days", Number(e.target.value))}
                  className="w-full bg-white border border-[#E0E0DA] rounded-md px-4 py-3 font-body text-sm text-[#0B0B0F] focus:outline-none focus:border-[#1E3A5F] transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="font-body text-xs text-[#6B6B73] mb-1 block">Allowed Categories</label>
              <input
                type="text"
                value={form.categories}
                onChange={(e) => update("categories", e.target.value)}
                className="w-full bg-white border border-[#E0E0DA] rounded-md px-4 py-3 font-body text-sm text-[#0B0B0F] focus:outline-none focus:border-[#1E3A5F] transition-colors"
                placeholder="fashion, beauty, lifestyle"
              />
            </div>
            <div>
              <label className="font-body text-xs text-[#6B6B73] mb-1 block">Restricted Categories</label>
              <input
                type="text"
                value={form.restricted_categories}
                onChange={(e) => update("restricted_categories", e.target.value)}
                className="w-full bg-white border border-[#E0E0DA] rounded-md px-4 py-3 font-body text-sm text-[#0B0B0F] focus:outline-none focus:border-[#1E3A5F] transition-colors"
                placeholder="gambling, alcohol, tobacco, adult content"
              />
            </div>
            <div>
              <label className="font-body text-xs text-[#6B6B73] mb-1 block">Geo Restrictions (blocked regions)</label>
              <input
                type="text"
                value={form.geo_restrictions}
                onChange={(e) => update("geo_restrictions", e.target.value)}
                className="w-full bg-white border border-[#E0E0DA] rounded-md px-4 py-3 font-body text-sm text-[#0B0B0F] focus:outline-none focus:border-[#1E3A5F] transition-colors"
                placeholder="e.g. RU, CN, IR"
              />
            </div>
          </fieldset>

          {/* Content Permissions */}
          <fieldset className="space-y-3">
            <legend className="font-body text-xs tracking-[0.2em] uppercase text-[#1E3A5F] mb-4">
              Content Permissions
            </legend>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.allow_image_generation}
                onChange={(e) => update("allow_image_generation", e.target.checked)}
                className="w-4 h-4 accent-[#1E3A5F]"
              />
              <span className="font-body text-sm text-[#0B0B0F]">Allow AI image generation</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.allow_video_generation}
                onChange={(e) => update("allow_video_generation", e.target.checked)}
                className="w-4 h-4 accent-[#1E3A5F]"
              />
              <span className="font-body text-sm text-[#0B0B0F]">Allow AI video generation</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.allow_ai_training}
                onChange={(e) => update("allow_ai_training", e.target.checked)}
                className="w-4 h-4 accent-[#1E3A5F]"
              />
              <span className="font-body text-sm text-[#0B0B0F]">Allow use of likeness for AI model training</span>
            </label>
          </fieldset>

          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full inline-flex items-center justify-center gap-2 bg-[#0B0B0F] text-[#FAFAF8] font-body text-sm font-medium tracking-wide py-4 px-8 rounded-md hover:bg-[#1E3A5F] transition-colors duration-300 disabled:opacity-50"
          >
            {status === "loading" ? "Registering..." : "Register as Talent"}
            <ArrowRight className="w-4 h-4" />
          </button>

          {status === "error" && (
            <p className="font-body text-sm text-red-600 text-center">
              Registration failed. Please try again.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
