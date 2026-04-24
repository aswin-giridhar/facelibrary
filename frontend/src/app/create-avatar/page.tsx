"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The canonical upload flow moved to /talent/my-face — which has the full
// Figma-spec UI, sticky top-nav, real file uploads, portfolio section, and
// a proper "avatar already generated" state. This route is kept as a
// permanent redirect for any stale internal links, external bookmarks, or
// emails that still point at /create-avatar.
export default function CreateAvatarRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/talent/my-face");
  }, [router]);
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-black border-t-transparent" />
    </div>
  );
}
