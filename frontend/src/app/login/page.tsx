"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";
import { login } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { setUser } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await login({ email, password });
      setUser(res);
      if (res.role === "talent") router.push("/talent/dashboard");
      else if (res.role === "brand") router.push("/brand/dashboard");
      else router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAFAF8] px-4">
      <div className="w-full max-w-md bg-white border border-[#E0E0DA] rounded-lg shadow-sm p-8">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#0B0B0F]">
              <span className="font-display text-base font-bold italic text-[#0B0B0F]">FL</span>
            </div>
            <span className="font-body text-lg font-bold tracking-[0.2em] text-[#0B0B0F]">FACE LIBRARY</span>
          </Link>
          <h1 className="font-display text-2xl font-bold text-[#0B0B0F]">Welcome Back</h1>
          <p className="font-body text-sm text-[#6B6B73] mt-1">Sign in to your account</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 font-body text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-body text-sm font-medium text-[#0B0B0F] mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2.5 border border-[#E0E0DA] rounded-md font-body text-sm focus:outline-none focus:border-[#1E3A5F] bg-white"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block font-body text-sm font-medium text-[#0B0B0F] mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2.5 border border-[#E0E0DA] rounded-md font-body text-sm focus:outline-none focus:border-[#1E3A5F] bg-white"
              placeholder="Enter your password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#0B0B0F] text-[#FAFAF8] font-body text-sm font-medium py-3 rounded-md hover:bg-[#1E3A5F] transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="text-center font-body text-sm text-[#6B6B73] mt-6">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-[#1E3A5F] hover:underline font-medium">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
