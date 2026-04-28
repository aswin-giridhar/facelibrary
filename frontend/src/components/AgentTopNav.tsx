"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, User } from "lucide-react";
import { useAuth } from "@/lib/auth";

const TABS: { label: string; href: string }[] = [
  { label: "Dashboard", href: "/agent/dashboard" },
  { label: "Talents", href: "/agent/talents" },
  { label: "Licenses", href: "/agent/licenses" },
  { label: "Revenue", href: "/agent/billing" },
  { label: "Messages", href: "/messages" },
];

export default function AgentTopNav({ active }: { active: string }) {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 grid grid-cols-3 items-center h-14">
        <div className="justify-self-start flex items-center gap-2.5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">FL</span>
            </div>
            <span className="hidden sm:inline text-sm font-semibold tracking-[0.18em] text-gray-900">
              FACE LIBRARY
            </span>
          </Link>
        </div>

        <div className="justify-self-center hidden md:flex items-center gap-1">
          {TABS.map((tab) => {
            const isActive = tab.label === active;
            return (
              <Link
                key={tab.label}
                href={tab.href}
                className={`px-4 py-4 text-sm whitespace-nowrap transition-colors relative ${
                  isActive ? "text-black font-medium" : "text-gray-500 hover:text-black"
                }`}
              >
                {tab.label}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-black" />
                )}
              </Link>
            );
          })}
        </div>

        <div className="justify-self-end flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center">
            <User className="w-4 h-4 text-white" />
          </div>
          <span className="hidden sm:inline text-sm font-medium text-gray-900">
            {user?.name || "—"}
          </span>
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-gray-700 transition-colors ml-1"
            aria-label="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </nav>
  );
}
