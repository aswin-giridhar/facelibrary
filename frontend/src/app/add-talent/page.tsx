"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The canonical agency-onboarding flow lives at /add-new-talent. /add-talent
// is kept as a permanent redirect for any stale links.
export default function AddTalentRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/add-new-talent");
  }, [router]);
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-black border-t-transparent" />
    </div>
  );
}
