"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Mail, CheckCircle, RefreshCw } from "lucide-react";
import { resendVerification } from "@/lib/api";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "your@email.com";
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleResend = async () => {
    if (status === "sending" || countdown > 0 || !email || email === "your@email.com") return;
    setStatus("sending");
    setErrorMsg(null);
    try {
      await resendVerification(email);
      setStatus("sent");
      setCountdown(60);
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Could not resend. Please try again later.");
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center py-12 px-6">
      <div className="w-full max-w-md text-center">
        <Link href="/" className="inline-flex items-center gap-2 mb-8">
          <div className="w-10 h-10 bg-black text-white flex items-center justify-center text-sm font-bold">
            FL
          </div>
          <span className="font-semibold text-lg tracking-wide">FACE LIBRARY</span>
        </Link>

        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Mail className="w-10 h-10 text-gray-600" />
        </div>

        <h1 className="text-3xl font-medium mb-3">Check Your Email</h1>
        <p className="text-gray-600 mb-2">We&apos;ve sent a verification link to:</p>
        <p className="text-black font-semibold text-lg mb-6">{email}</p>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-6 text-left">
          <h3 className="font-semibold mb-3">What to do next:</h3>
          <ol className="space-y-2 text-sm text-gray-700">
            <li className="flex gap-3">
              <span className="font-semibold text-black">1.</span>
              Open your email inbox (also check spam / promotions)
            </li>
            <li className="flex gap-3">
              <span className="font-semibold text-black">2.</span>
              Click the verification link from Face Library
            </li>
            <li className="flex gap-3">
              <span className="font-semibold text-black">3.</span>
              You&apos;ll be redirected to your dashboard automatically
            </li>
          </ol>
        </div>

        <button
          onClick={handleResend}
          disabled={countdown > 0 || status === "sending"}
          className="w-full flex items-center justify-center gap-2 border border-gray-300 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-4"
        >
          <RefreshCw className={`w-4 h-4 ${status === "sending" ? "animate-spin" : ""}`} />
          {countdown > 0
            ? `Resend in ${countdown}s`
            : status === "sending"
            ? "Sending…"
            : "Resend Verification Email"}
        </button>

        {status === "sent" && (
          <div className="flex items-center justify-center gap-2 text-green-600 text-sm mb-4">
            <CheckCircle className="w-4 h-4" />
            Verification email resent. Please check your inbox.
          </div>
        )}
        {status === "error" && errorMsg && (
          <div className="text-red-600 text-sm mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
            {errorMsg}
          </div>
        )}

        <p className="text-xs text-gray-500 mt-6">
          Already verified?{" "}
          <Link href="/login" className="text-black underline hover:no-underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-black border-t-transparent" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
