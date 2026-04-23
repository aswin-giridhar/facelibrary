"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, Building2, Users, CheckCircle, Loader2, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getMyRoles, type UserRoles } from "@/lib/api";

type RoleKey = "talent" | "client" | "agent";

interface RoleCard {
  key: RoleKey;
  label: string;
  title: string;
  description: string;
  registerHref: string;
  dashboardHref: string;
  colorClasses: string;
  iconBg: string;
  iconColor: string;
  icon: typeof User;
}

const ROLE_CARDS: RoleCard[] = [
  {
    key: "talent",
    label: "Talent",
    title: "Register as Talent",
    description: "Protect your likeness, create your digital avatar, and earn from licensing",
    registerHref: "/talent/register",
    dashboardHref: "/talent/dashboard",
    colorClasses: "bg-blue-50 border-blue-200 hover:border-blue-400",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    icon: User,
  },
  {
    key: "client",
    label: "Brand",
    title: "Register as Brand",
    description: "Find talent, create campaigns, and manage licensing contracts",
    registerHref: "/client/register",
    dashboardHref: "/client/dashboard",
    colorClasses: "bg-purple-50 border-purple-200 hover:border-purple-400",
    iconBg: "bg-purple-100",
    iconColor: "text-purple-600",
    icon: Building2,
  },
  {
    key: "agent",
    label: "Agency",
    title: "Register as Agency",
    description: "Manage talent roster, generate contracts, and review deals",
    registerHref: "/agent/register",
    dashboardHref: "/agent/dashboard",
    colorClasses: "bg-green-50 border-green-200 hover:border-green-400",
    iconBg: "bg-green-100",
    iconColor: "text-green-600",
    icon: Users,
  },
];

export default function SignupPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [roles, setRoles] = useState<UserRoles | null>(null);
  const [rolesLoading, setRolesLoading] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setRoles(null);
      return;
    }
    setRolesLoading(true);
    getMyRoles()
      .then(setRoles)
      .catch(() => setRoles(null))
      .finally(() => setRolesLoading(false));
  }, [user, authLoading]);

  const heldRoles = new Set<string>((roles?.roles || []).map((r) => r.role));
  const hasAnyRole = heldRoles.size > 0;
  const missingRoles = ROLE_CARDS.filter((c) => !heldRoles.has(c.key));

  if (authLoading || rolesLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center py-12 px-6">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 bg-black text-white flex items-center justify-center text-sm font-bold">
              FL
            </div>
            <span className="font-semibold text-lg tracking-wide">FACE LIBRARY</span>
          </Link>
          {user && hasAnyRole ? (
            <>
              <h1 className="text-3xl font-medium mb-2">Switch or add a role</h1>
              <p className="text-gray-600">
                Signed in as {user.email}. You can continue as one of your existing
                roles or add another.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-medium mb-2">Choose Your Role</h1>
              <p className="text-gray-600">
                Select how you want to use Face Library
              </p>
            </>
          )}
        </div>

        {/* Existing roles: one-click switch */}
        {user && hasAnyRole && (
          <div className="mb-8">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Your roles
            </p>
            <div className="space-y-3">
              {ROLE_CARDS.filter((c) => heldRoles.has(c.key)).map((role) => {
                const Icon = role.icon;
                return (
                  <button
                    key={role.key}
                    onClick={() => router.push(role.dashboardHref)}
                    className="w-full border-2 border-gray-200 rounded-xl p-5 flex items-center gap-4 text-left hover:border-black transition-colors"
                  >
                    <div className={`w-12 h-12 rounded-xl ${role.iconBg} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-6 h-6 ${role.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold">{role.label}</h3>
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      </div>
                      <p className="text-xs text-gray-500">
                        Go to your {role.label.toLowerCase()} dashboard
                      </p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-400" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Add-a-role cards (or all cards for a new user) */}
        {(missingRoles.length > 0) && (
          <div>
            {user && hasAnyRole && (
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Add another role
              </p>
            )}
            <div className="space-y-4">
              {missingRoles.map((role) => {
                const Icon = role.icon;
                return (
                  <Link
                    key={role.key}
                    href={role.registerHref}
                    className={`w-full border-2 rounded-xl p-6 transition-all ${role.colorClasses} text-left flex items-center gap-4 group block`}
                  >
                    <div className={`w-16 h-16 rounded-xl ${role.iconBg} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}>
                      <Icon className={`w-8 h-8 ${role.iconColor}`} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold mb-1">{role.title}</h3>
                      <p className="text-sm text-gray-600">{role.description}</p>
                    </div>
                    <div className="text-gray-400 group-hover:text-gray-600 transition-colors">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* New-user tip only */}
        {!user && (
          <div className="mt-8 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-sm text-gray-600 text-center">
              <strong>Tip:</strong> You can add more roles later — one account can
              be a talent, a brand, and an agency at once.
            </p>
          </div>
        )}

        {/* Back to Login / Logout */}
        <div className="mt-6 text-center text-sm text-gray-600">
          {user ? (
            <>
              Not you?{" "}
              <Link href="/login" className="text-black font-medium hover:underline">
                Sign out and switch account
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link href="/login" className="text-black font-medium hover:underline">
                Sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
