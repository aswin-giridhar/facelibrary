"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Menu, X } from "lucide-react";

export default function ForAgentsPage() {
  const [isForYouOpen, setIsForYouOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 border-2 border-black flex items-center justify-center">
              <span className="font-bold text-sm">FL</span>
            </div>
            <span className="font-semibold text-lg">FACE LIBRARY</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/#how-it-works" className="text-gray-700 hover:text-black transition-colors">How it Works</Link>
            <Link href="/talent/library" className="text-gray-700 hover:text-black transition-colors">Face Library</Link>
            <div className="relative">
              <button onClick={() => setIsForYouOpen(!isForYouOpen)} className="flex items-center gap-1 text-black font-semibold">
                For You <ChevronDown className={`w-4 h-4 transition-transform ${isForYouOpen ? "rotate-180" : ""}`} />
              </button>
              {isForYouOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsForYouOpen(false)} />
                  <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                    <Link href="/for-talent" onClick={() => setIsForYouOpen(false)} className="block px-4 py-3 hover:bg-gray-50">For Talents</Link>
                    <Link href="/for-agents" onClick={() => setIsForYouOpen(false)} className="block px-4 py-3 hover:bg-gray-50 font-medium">For Agencies</Link>
                    <Link href="/for-brands" onClick={() => setIsForYouOpen(false)} className="block px-4 py-3 hover:bg-gray-50">For Brands</Link>
                  </div>
                </>
              )}
            </div>
          </nav>
          <div className="hidden md:flex items-center gap-4">
            <Link href="/login" className="text-gray-700 hover:text-black transition-colors font-medium">Login</Link>
            <Link href="/signup" className="bg-black text-white px-6 py-2 rounded-md hover:bg-gray-800 transition-colors font-medium text-sm">Sign Up</Link>
          </div>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 text-gray-700 hover:text-black">
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white px-6 py-4 space-y-3">
            <Link href="/#how-it-works" className="block text-gray-700 hover:text-black py-2" onClick={() => setMobileMenuOpen(false)}>How it Works</Link>
            <Link href="/talent/library" className="block text-gray-700 hover:text-black py-2" onClick={() => setMobileMenuOpen(false)}>Face Library</Link>
            <Link href="/for-talent" className="block text-gray-700 hover:text-black py-2" onClick={() => setMobileMenuOpen(false)}>For Talents</Link>
            <Link href="/for-agents" className="block text-black font-medium py-2" onClick={() => setMobileMenuOpen(false)}>For Agencies</Link>
            <Link href="/for-brands" className="block text-gray-700 hover:text-black py-2" onClick={() => setMobileMenuOpen(false)}>For Brands</Link>
            <div className="border-t border-gray-200 pt-3 flex gap-3">
              <Link href="/login" className="flex-1 text-center py-2 text-gray-700 border border-gray-300 rounded-md" onClick={() => setMobileMenuOpen(false)}>Login</Link>
              <Link href="/signup" className="flex-1 text-center py-2 bg-black text-white rounded-md" onClick={() => setMobileMenuOpen(false)}>Sign Up</Link>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-medium mb-8">For Agencies</h1>
          <div className="space-y-6 text-lg text-gray-600 mb-12">
            <p className="leading-relaxed">AI-generated content is reshaping how talent is used in campaigns &mdash; and agencies need new tools to keep their roster protected and paid.</p>
            <p className="leading-relaxed">Face Library gives agencies a single place to verify talent, control their digital likeness, set usage permissions, and generate UK-law compliant licensing contracts at scale.</p>
            <p className="leading-relaxed">Every request is reviewable, every payment is tracked, and every rights grant is auditable &mdash; so your talent gets paid fairly and your agency stays in control of how faces are used.</p>
          </div>
          <Link href="/agent/register" className="bg-black text-white px-8 py-4 rounded-lg hover:bg-gray-800 transition-colors text-lg inline-block">Register as Agency</Link>
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 border border-black flex items-center justify-center"><span className="text-[8px] font-bold">FL</span></div>
            <span className="text-xs text-gray-500">&copy; 2026 Face Library</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/talent/library" className="text-gray-500 hover:text-black">Face Library</Link>
            <Link href="/privacy" className="text-gray-500 hover:text-black">Privacy</Link>
            <Link href="/terms" className="text-gray-500 hover:text-black">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
