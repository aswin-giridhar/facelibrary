"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, Building2, Shield } from "lucide-react";
import { signup } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const ROLES = [
  { value: "talent", label: "Talent", sublabel: "License your likeness", icon: User },
  { value: "brand", label: "Brand", sublabel: "Use licensed likenesses", icon: Building2 },
  { value: "agent", label: "Agent", sublabel: "Manage talent rosters", icon: Shield },
] as const;

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("talent");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { setUser } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await signup({
        email,
        password,
        name,
        role,
        company_name: role === "brand" ? companyName : undefined,
      });
      setUser(res);
      if (res.role === "talent") router.push("/talent/dashboard");
      else if (res.role === "brand") router.push("/brand/dashboard");
      else router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAFAF8] px-4 py-12">
      <div className="w-full max-w-md bg-white border border-[#E0E0DA] rounded-lg shadow-sm p-8">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#0B0B0F]">
              <span className="font-display text-base font-bold italic text-[#0B0B0F]">FL</span>
            </div>
            <span className="font-body text-lg font-bold tracking-[0.2em] text-[#0B0B0F]">FACE LIBRARY</span>
          </Link>
          <h1 className="font-display text-2xl font-bold text-[#0B0B0F]">Create Account</h1>
          <p className="font-body text-sm text-[#6B6B73] mt-1">Choose your role to get started</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 font-body text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Role selection */}
          <div className="grid grid-cols-3 gap-2">
            {ROLES.map(({ value, label, sublabel, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setRole(value)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all ${
                  role === value
                    ? "border-[#1E3A5F] bg-[#1E3A5F]/5"
                    : "border-[#E0E0DA] hover:border-[#6B6B73]"
                }`}
              >
                <Icon className={`w-5 h-5 ${role === value ? "text-[#1E3A5F]" : "text-[#6B6B73]"}`} />
                <span className={`font-body text-xs font-medium ${role === value ? "text-[#1E3A5F]" : "text-[#0B0B0F]"}`}>
                  {label}
                </span>
                <span className="font-body text-[10px] text-[#6B6B73]">{sublabel}</span>
              </button>
            ))}
          </div>

          <div>
            <label className="block font-body text-sm font-medium text-[#0B0B0F] mb-1">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-4 py-2.5 border border-[#E0E0DA] rounded-md font-body text-sm focus:outline-none focus:border-[#1E3A5F] bg-white"
              placeholder="Your full name"
            />
          </div>

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
              minLength={6}
              className="w-full px-4 py-2.5 border border-[#E0E0DA] rounded-md font-body text-sm focus:outline-none focus:border-[#1E3A5F] bg-white"
              placeholder="Min 6 characters"
            />
          </div>

          {role === "brand" && (
            <div>
              <label className="block font-body text-sm font-medium text-[#0B0B0F] mb-1">Company Name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-4 py-2.5 border border-[#E0E0DA] rounded-md font-body text-sm focus:outline-none focus:border-[#1E3A5F] bg-white"
                placeholder="Your company"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#0B0B0F] text-[#FAFAF8] font-body text-sm font-medium py-3 rounded-md hover:bg-[#1E3A5F] transition-colors disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="text-center font-body text-sm text-[#6B6B73] mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-[#1E3A5F] hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
