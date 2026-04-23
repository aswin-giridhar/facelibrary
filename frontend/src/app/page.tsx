"use client";

import { useState, Fragment } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ChevronDown,
  Menu,
  X,
  Shield,
  Sliders,
  DollarSign,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

const steps = [
  {
    num: 1,
    title: "Create Your Profile",
    desc: "Sign up as Talent, Agency, or Brand. Create your digital likeness profile.",
    caption: "Sign up as Talent, Agency, or Brand",
    image:
      "https://images.unsplash.com/photo-1759932021109-ffbec9251f9b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800",
  },
  {
    num: 2,
    title: "Verify Yourself",
    desc: "Confirm ownership of your face using photos, video, and social accounts.",
    caption: "Confirm ownership of your face",
    image:
      "https://images.unsplash.com/photo-1603899122361-e99b4f6fecf5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800",
  },
  {
    num: 3,
    title: "Upload Your Digits",
    desc: "Upload face photos, body photos, and a short video.",
    caption: "Protected dataset for digital likeness",
    image:
      "https://images.unsplash.com/photo-1674027215032-f0c4292318ee?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800",
  },
  {
    num: 4,
    title: "Set Permissions",
    desc: "Choose where and how your likeness can be used.",
    caption: "Control industries, duration, and usage",
    image:
      "https://images.unsplash.com/photo-1702468292651-fd16394e4ddd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800",
  },
  {
    num: 5,
    title: "Approve & Get Paid",
    desc: "Brands request to use your likeness. Approve requests and receive payment for licensed campaigns.",
    caption: "Approve usage and get paid",
    image:
      "https://images.unsplash.com/photo-1551288049-bebda4e38f71?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800",
  },
];

export default function HomePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [isForYouOpen, setIsForYouOpen] = useState(false);
  const [isSignUpOpen, setIsSignUpOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const dashboardPath =
    user?.role === "talent"
      ? "/talent/dashboard"
      : user?.role === "client" || user?.role === "brand"
      ? "/client/dashboard"
      : user?.role === "agent"
      ? "/agent/dashboard"
      : "/";

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 border-2 border-black flex items-center justify-center">
              <span className="font-bold text-sm">FL</span>
            </div>
            <span className="font-semibold text-lg">FACE LIBRARY</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            <Link
              href="#how-it-works"
              className="text-gray-700 hover:text-black transition-colors"
            >
              How it Works
            </Link>
            <Link
              href="/talent/library"
              className="text-gray-700 hover:text-black transition-colors"
            >
              Face Library
            </Link>

            {/* For You Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsForYouOpen(!isForYouOpen)}
                className="flex items-center gap-1 text-gray-700 hover:text-black transition-colors font-semibold"
              >
                For You
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${
                    isForYouOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {isForYouOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setIsForYouOpen(false)}
                  />
                  <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                    <Link
                      href="/for-talent"
                      onClick={() => setIsForYouOpen(false)}
                      className="block w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      For Talents
                    </Link>
                    <Link
                      href="/for-agents"
                      onClick={() => setIsForYouOpen(false)}
                      className="block w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      For Agencies
                    </Link>
                    <Link
                      href="/for-brands"
                      onClick={() => setIsForYouOpen(false)}
                      className="block w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      For Brands
                    </Link>
                  </div>
                </>
              )}
            </div>
          </nav>

          <div className="flex items-center gap-4">
            {user ? (
              <>
                <span className="text-sm text-gray-600 hidden sm:block">
                  {user.name}
                </span>
                <button
                  onClick={() => router.push(dashboardPath)}
                  className="bg-black text-white px-6 py-2 rounded-md hover:bg-gray-800 transition-colors font-medium text-sm"
                >
                  Dashboard
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-gray-700 hover:text-black transition-colors font-medium"
                >
                  Login
                </Link>
                <div className="relative">
                  <button
                    onClick={() => setIsSignUpOpen(!isSignUpOpen)}
                    className="bg-black text-white px-6 py-2 rounded-md hover:bg-gray-800 transition-colors font-medium flex items-center gap-2 text-sm"
                  >
                    Sign Up
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${
                        isSignUpOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {isSignUpOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setIsSignUpOpen(false)}
                      />
                      <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                        <Link
                          href="/talent/register"
                          onClick={() => setIsSignUpOpen(false)}
                          className="block px-4 py-3 hover:bg-gray-50 border-b border-gray-100"
                        >
                          <div className="font-medium text-sm">As Talent</div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            Protect your likeness
                          </div>
                        </Link>
                        <Link
                          href="/agent/register"
                          onClick={() => setIsSignUpOpen(false)}
                          className="block px-4 py-3 hover:bg-gray-50 border-b border-gray-100"
                        >
                          <div className="font-medium text-sm">As Agency</div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            Manage talent roster
                          </div>
                        </Link>
                        <Link
                          href="/client/register"
                          onClick={() => setIsSignUpOpen(false)}
                          className="block px-4 py-3 hover:bg-gray-50"
                        >
                          <div className="font-medium text-sm">As Brand</div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            License talent
                          </div>
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-gray-700 hover:text-black"
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white px-6 py-4 space-y-3">
            <Link
              href="#how-it-works"
              className="block text-gray-700 hover:text-black py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              How it Works
            </Link>
            <Link
              href="/talent/library"
              className="block text-gray-700 hover:text-black py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Face Library
            </Link>
            <Link
              href="/for-talent"
              className="block text-gray-700 hover:text-black py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              For Talents
            </Link>
            <Link
              href="/for-agents"
              className="block text-gray-700 hover:text-black py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              For Agencies
            </Link>
            <Link
              href="/for-brands"
              className="block text-gray-700 hover:text-black py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              For Brands
            </Link>
            <div className="border-t border-gray-200 pt-3 flex gap-3">
              <Link
                href="/login"
                className="flex-1 text-center py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                onClick={() => setMobileMenuOpen(false)}
              >
                Login
              </Link>
              <Link
                href="/signup"
                className="flex-1 text-center py-2 bg-black text-white rounded-md hover:bg-gray-800"
                onClick={() => setMobileMenuOpen(false)}
              >
                Sign Up
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Hero with faces_background.jpeg */}
      <section className="relative bg-black text-white overflow-hidden">
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/faces-background.jpeg"
            alt=""
            className="w-full h-full object-cover opacity-50"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/40" />

        <div className="relative max-w-7xl mx-auto px-6 py-24 lg:py-32">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
              Protect, License, and Monetize
              <br />
              Your Digital Likeness
            </h1>
            <p className="text-lg md:text-xl text-gray-200 mb-8 leading-relaxed">
              Verify your identity, upload your protected digits, control usage, and get paid for licensed campaigns.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/talent/register"
                className="bg-white text-black px-6 py-3 rounded-md flex items-center gap-2 hover:bg-gray-100 transition-colors font-medium"
              >
                Register as Talent
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="/talent/library"
                className="border-2 border-white text-white px-6 py-3 rounded-md hover:bg-white hover:text-black transition-colors font-medium"
              >
                Explore Face Library
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 3 Feature Pills */}
      <section className="py-16 md:py-20">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8">
          <div className="flex items-center justify-center gap-3 md:gap-6 flex-wrap">
            <div className="bg-white rounded-full px-5 md:px-8 py-3 md:py-4 shadow-sm border border-gray-100 flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 text-green-700" />
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-0.5">1</div>
                <div className="font-semibold text-sm">Verified Identity</div>
              </div>
            </div>

            <ArrowRight className="w-5 h-5 md:w-6 md:h-6 text-gray-400 hidden sm:block" />

            <div className="bg-white rounded-full px-5 md:px-8 py-3 md:py-4 shadow-sm border border-gray-100 flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Sliders className="w-5 h-5 text-blue-700" />
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-0.5">2</div>
                <div className="font-semibold text-sm">Full Control</div>
              </div>
            </div>

            <ArrowRight className="w-5 h-5 md:w-6 md:h-6 text-gray-400 hidden sm:block" />

            <div className="bg-white rounded-full px-5 md:px-8 py-3 md:py-4 shadow-sm border border-gray-100 flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center flex-shrink-0">
                <DollarSign className="w-5 h-5 text-yellow-700" />
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-0.5">3</div>
                <div className="font-semibold text-sm">Earn From Your Face</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5 Step Cards */}
      <section className="pb-20 md:pb-24">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8">
          {/* Desktop: flex with inline arrows (matches Figma).
              items-stretch ensures all cards share the row's tallest height.
              Each card is a flex-col so header/desc/image/caption stack,
              and mt-auto on the image wrapper anchors images to the same
              baseline from the bottom regardless of description length. */}
          <div className="hidden lg:flex items-stretch gap-4 xl:gap-6">
            {steps.map((step, idx) => (
              <Fragment key={step.num}>
                <div className="flex-1 flex flex-col bg-white rounded-[20px] shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {step.num}
                    </div>
                    <h3 className="font-semibold text-lg leading-tight">
                      {step.title}
                    </h3>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed mb-6 min-h-[4.5rem]">
                    {step.desc}
                  </p>
                  <div className="aspect-[4/5] rounded-2xl overflow-hidden mb-3 bg-gray-100 mt-auto">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={step.image}
                      alt={step.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="text-xs text-gray-500 text-center">
                    {step.caption}
                  </p>
                </div>
                {idx < steps.length - 1 && (
                  <div className="flex-shrink-0 self-center">
                    <ArrowRight className="w-6 h-6 text-gray-300" />
                  </div>
                )}
              </Fragment>
            ))}
          </div>

          {/* Mobile/tablet: stacked grid. items-stretch gives equal-height
              cards within each row; min-h on description keeps images
              aligned across the two columns on md. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:hidden items-stretch">
            {steps.map((step) => (
              <div
                key={step.num}
                className="flex flex-col bg-white rounded-[20px] shadow-sm border border-gray-100 p-6"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {step.num}
                  </div>
                  <h3 className="font-semibold text-lg leading-tight">
                    {step.title}
                  </h3>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed mb-6 min-h-[4.5rem]">
                  {step.desc}
                </p>
                <div className="aspect-[4/5] rounded-2xl overflow-hidden mb-3 bg-gray-100 mt-auto">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={step.image}
                    alt={step.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <p className="text-xs text-gray-500 text-center">
                  {step.caption}
                </p>
              </div>
            ))}
          </div>

          <div className="text-center mt-16">
            <Link
              href="/talent/register"
              className="inline-flex items-center gap-2 bg-black text-white px-8 py-4 rounded-lg hover:bg-gray-800 transition-colors text-base font-medium"
            >
              Get Started
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ===== How It Works (process diagram + explainer, inlined from the old /how-it-works page) ===== */}
      <section id="how-it-works" className="py-16 md:py-20 bg-[#F9FAFB] scroll-mt-20">
        <div className="max-w-6xl mx-auto px-6 md:px-8">
          <div className="text-center mb-12">
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">
              How It Works
            </p>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 leading-tight">
              From sign-up to payout, end-to-end
            </h2>
            <p className="text-base md:text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
              How Face Library verifies talent, licenses likenesses, and
              protects rights at every step.
            </p>
          </div>

          <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 p-4 md:p-8 mb-12">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/how-it-works-process.jpeg"
              alt="Face Library process diagram — from sign-up through verification, licensing, and payout"
              className="w-full h-auto object-contain rounded-xl"
            />
          </div>

          <div className="max-w-3xl mx-auto space-y-5 text-gray-700 leading-relaxed">
            <p>
              Every profile starts with <strong>identity verification</strong>{" "}
              — photos, video, and social account ownership are cross-checked
              so only the real person can license their own likeness.
            </p>
            <p>
              Once verified, talent upload their <strong>protected digits</strong>{" "}
              — a structured dataset of face angles, body poses, and short
              identity videos that becomes the canonical source for every
              future licensed asset.
            </p>
            <p>
              Talent then set <strong>permissions</strong> (industries,
              duration, geography, AI training allowed or not). Brands send
              license requests; talent approve or reject. On approval, a
              UK-law compliant contract is generated, the brand pays, and
              funds are released to the talent.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 border border-black flex items-center justify-center">
                <span className="text-[8px] font-bold">FL</span>
              </div>
              <span className="text-xs text-gray-500">
                &copy; 2026 Face Library
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <Link
                href="/talent/library"
                className="text-gray-500 hover:text-black transition-colors"
              >
                Face Library
              </Link>
              <Link
                href="/privacy"
                className="text-gray-500 hover:text-black transition-colors"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="text-gray-500 hover:text-black transition-colors"
              >
                Terms
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
