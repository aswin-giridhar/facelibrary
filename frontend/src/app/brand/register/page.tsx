"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { registerBrand } from "@/lib/api";

export default function BrandRegisterPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    company_name: "",
    industry: "",
    website: "",
    description: "",
  });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await registerBrand(form);
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
          <h1 className="font-display text-3xl text-[#0B0B0F] mb-2">Brand Registered</h1>
          <p className="font-body text-[#6B6B73] mb-6">
            Your brand profile has been created. Your ID is <strong>#{String(result.id)}</strong>.
          </p>
          <Link
            href="/brand/search"
            className="inline-flex items-center gap-2 bg-[#0B0B0F] text-[#FAFAF8] font-body text-sm font-medium py-3 px-8 rounded-md hover:bg-[#1E3A5F] transition-colors"
          >
            Search Talent
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

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

      <div className="max-w-2xl mx-auto px-8 py-16">
        <div className="mb-10">
          <p className="font-body text-xs tracking-[0.25em] uppercase text-[#1E3A5F] mb-3">
            For Brands
          </p>
          <h1 className="font-display text-4xl font-light text-[#0B0B0F] leading-tight">
            License likenesses <span className="italic">compliantly</span>
          </h1>
          <p className="font-body text-[#6B6B73] mt-3">
            Search talent, request licenses, and receive AI-generated contracts — all automated.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <fieldset className="space-y-4">
            <legend className="font-body text-xs tracking-[0.2em] uppercase text-[#1E3A5F] mb-4">
              Brand Information
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="font-body text-xs text-[#6B6B73] mb-1 block">Contact Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  className="w-full bg-white border border-[#E0E0DA] rounded-md px-4 py-3 font-body text-sm text-[#0B0B0F] focus:outline-none focus:border-[#1E3A5F] transition-colors"
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
                />
              </div>
            </div>
            <div>
              <label className="font-body text-xs text-[#6B6B73] mb-1 block">Company Name *</label>
              <input
                type="text"
                required
                value={form.company_name}
                onChange={(e) => update("company_name", e.target.value)}
                className="w-full bg-white border border-[#E0E0DA] rounded-md px-4 py-3 font-body text-sm text-[#0B0B0F] focus:outline-none focus:border-[#1E3A5F] transition-colors"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="font-body text-xs text-[#6B6B73] mb-1 block">Industry</label>
                <input
                  type="text"
                  value={form.industry}
                  onChange={(e) => update("industry", e.target.value)}
                  className="w-full bg-white border border-[#E0E0DA] rounded-md px-4 py-3 font-body text-sm text-[#0B0B0F] focus:outline-none focus:border-[#1E3A5F] transition-colors"
                  placeholder="Fashion, Tech, Entertainment"
                />
              </div>
              <div>
                <label className="font-body text-xs text-[#6B6B73] mb-1 block">Website</label>
                <input
                  type="url"
                  value={form.website}
                  onChange={(e) => update("website", e.target.value)}
                  className="w-full bg-white border border-[#E0E0DA] rounded-md px-4 py-3 font-body text-sm text-[#0B0B0F] focus:outline-none focus:border-[#1E3A5F] transition-colors"
                  placeholder="https://example.com"
                />
              </div>
            </div>
            <div>
              <label className="font-body text-xs text-[#6B6B73] mb-1 block">Company Description</label>
              <textarea
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                rows={3}
                className="w-full bg-white border border-[#E0E0DA] rounded-md px-4 py-3 font-body text-sm text-[#0B0B0F] focus:outline-none focus:border-[#1E3A5F] transition-colors resize-none"
              />
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full inline-flex items-center justify-center gap-2 bg-[#0B0B0F] text-[#FAFAF8] font-body text-sm font-medium tracking-wide py-4 px-8 rounded-md hover:bg-[#1E3A5F] transition-colors duration-300 disabled:opacity-50"
          >
            {status === "loading" ? "Registering..." : "Register Brand"}
            <ArrowRight className="w-4 h-4" />
          </button>

          {status === "error" && (
            <p className="font-body text-sm text-red-600 text-center">Registration failed. Please try again.</p>
          )}
        </form>
      </div>
    </div>
  );
}
