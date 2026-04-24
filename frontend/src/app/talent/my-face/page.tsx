"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Upload, LogOut, User, Loader2, CheckCircle,
  Sun, Image as ImageIcon, Sparkles, Eye, Wind, Glasses, Smile,
  Shield, Play,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  getTalent, listTalents, submitAvatarJob, uploadPhoto,
  getTalentPortfolio, setTalentPortfolio,
} from "@/lib/api";
import { FIGMA_REFERENCE_IMAGES as REFERENCE_IMAGES } from "@/lib/figma-reference-images";

/* ---------- Constants ---------- */

const FACE_DIGITS = [
  "Front", "Left Profile", "Right Profile", "3/4 Left",
  "3/4 Right", "Head Up", "Head Down", "Neutral",
  "Smile", "Eyes Closed", "Eyes Open", "Back Head",
];
const FACE_VIDEOS = ["Neutral talking", "Smile talking", "Turn head left/right"];
const BODY_DIGITS = [
  "Full Body Front", "Full Body Left", "Full Body Right", "Full Body Back",
  "3/4 Body Left", "3/4 Body Right",
];
const BODY_VIDEOS = ["Walking", "Turn 360", "Natural movement"];
const GUIDELINES = [
  { icon: Sun, label: "Natural Lighting" },
  { icon: ImageIcon, label: "White Background" },
  { icon: Sparkles, label: "No Filters" },
  { icon: Eye, label: "Face Fully Visible" },
  { icon: Wind, label: "Hair Away from Face" },
  { icon: Glasses, label: "No Sunglasses" },
  { icon: Smile, label: "Neutral Expression" },
];

const NAV_TABS = [
  { label: "Dashboard", href: "/talent/dashboard" },
  { label: "My Face", href: "/talent/my-face" },
  { label: "Licenses", href: "/talent/licenses" },
  { label: "Usage", href: "/talent/usage" },
  { label: "Billing", href: "/talent/earnings" },
  { label: "Messages", href: "/messages" },
];

interface TalentProfile {
  id: number;
  user_id: number;
  name?: string;
  stage_name?: string;
  photo_url?: string | null;
  image_url?: string | null;
  avatar_url?: string | null;
}

/* ---------- Component ---------- */

export default function TalentMyFacePage() {
  const { user, logout, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<TalentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  // Each slot holds the uploaded public URL (or null if not yet uploaded).
  const [facePhotos, setFacePhotos] = useState<Record<string, string | null>>({});
  const [faceVideos, setFaceVideos] = useState<Record<string, string | null>>({});
  const [bodyPhotos, setBodyPhotos] = useState<Record<string, string | null>>({});
  const [bodyVideos, setBodyVideos] = useState<Record<string, string | null>>({});
  const [identityVideo, setIdentityVideo] = useState<string | null>(null);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Portfolio (3-slot showcase shown on /talent-profile/{id})
  const [portfolio, setPortfolio] = useState<(string | null)[]>([null, null, null]);
  const [portfolioSaving, setPortfolioSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "talent")) {
      router.push("/login");
      return;
    }
    if (!user) return;
    (async () => {
      try {
        let p: TalentProfile | null = null;
        if (user.profile_id) {
          p = (await getTalent(user.profile_id)) as TalentProfile;
        } else {
          const ts: TalentProfile[] = await listTalents();
          p = ts.find((t) => t.user_id === user.user_id) ?? null;
        }
        setProfile(p);
        if (p) {
          const existing = await getTalentPortfolio(p.id).catch(() => [] as string[]);
          const padded: (string | null)[] = [null, null, null];
          existing.slice(0, 3).forEach((u, i) => { padded[i] = u; });
          setPortfolio(padded);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [user, authLoading, router]);

  const hasAvatar = Boolean(profile?.avatar_url);
  const faceCount = Object.values(facePhotos).filter(Boolean).length;
  const bodyCount = Object.values(bodyPhotos).filter(Boolean).length;
  const canGenerate = faceCount >= 5 && bodyCount >= 4;

  async function uploadSlot(
    slotKey: string,
    file: File,
    onDone: (url: string) => void
  ) {
    setError(null);
    setUploadingSlot(slotKey);
    try {
      const { url } = await uploadPhoto(file, { purpose: "avatar", slot: slotKey });
      onDone(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingSlot(null);
    }
  }

  const handleGenerate = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const face_photo_urls = Object.values(facePhotos).filter((u): u is string => Boolean(u));
      const face_video_urls = Object.values(faceVideos).filter((u): u is string => Boolean(u));
      const body_photo_urls = Object.values(bodyPhotos).filter((u): u is string => Boolean(u));
      const body_video_urls = Object.values(bodyVideos).filter((u): u is string => Boolean(u));
      const job = await submitAvatarJob({
        face_photo_count: faceCount,
        body_photo_count: bodyCount,
        face_photo_urls,
        face_video_urls,
        // Send body videos alongside body photos so the backend has a full
        // dataset; both arrays are persisted in avatar_jobs.
        body_photo_urls: [...body_photo_urls, ...body_video_urls],
        identity_video_url: identityVideo || undefined,
      });
      router.push(`/avatar-generating?jobId=${job.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start avatar generation");
      setSubmitting(false);
    }
  };

  async function handlePortfolioUpload(idx: number, file: File) {
    if (!profile) return;
    setError(null);
    setUploadingSlot(`portfolio-${idx}`);
    try {
      const { url } = await uploadPhoto(file, { purpose: "portfolio", slot: `portfolio${idx}` });
      const next = [...portfolio];
      next[idx] = url;
      setPortfolio(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Portfolio upload failed");
    } finally {
      setUploadingSlot(null);
    }
  }

  async function handlePortfolioSave() {
    if (!profile) return;
    setError(null);
    setPortfolioSaving(true);
    try {
      const urls = portfolio.filter((u): u is string => Boolean(u));
      await setTalentPortfolio(profile.id, urls);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save portfolio");
    } finally {
      setPortfolioSaving(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const image = profile?.photo_url || profile?.image_url || profile?.avatar_url || null;

  return (
    <div className="min-h-screen bg-white">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between h-14">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
                <span className="text-white text-xs font-bold">FL</span>
              </div>
            </Link>
            <div className="hidden md:flex items-center gap-1">
              {NAV_TABS.map((tab) => {
                const isActive = tab.label === "My Face";
                return (
                  <Link
                    key={tab.label}
                    href={tab.href}
                    className={`px-3 py-4 text-sm transition-colors relative ${
                      isActive ? "text-black font-medium" : "text-gray-500 hover:text-black"
                    }`}
                  >
                    {tab.label}
                    {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-black" />}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-medium text-gray-900">{user?.name || "—"}</span>
            <button onClick={() => { logout(); router.push("/login"); }} className="text-gray-400 hover:text-gray-700 ml-1">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-[1400px] mx-auto px-6 lg:px-8 py-10">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <Link href="/talent/dashboard" className="text-gray-500 hover:text-black inline-flex items-center gap-1 text-sm">
              <ArrowLeft className="w-4 h-4" /> Dashboard
            </Link>
            <span className="h-4 w-px bg-gray-200" />
          </div>
          <h1 className="text-3xl font-semibold mb-2">
            {hasAvatar ? "Your Digits" : "Upload Your Digits"}
          </h1>
          <p className="text-gray-600 text-base">
            {hasAvatar
              ? "Your digital avatar is generated. Replace any digit to re-trigger avatar regeneration."
              : "Premium AI dataset capture. Upload exact examples shown below."}
          </p>
        </div>

        {/* Avatar status banner */}
        {hasAvatar && profile?.avatar_url && (
          <div className="mb-10 bg-green-50 border border-green-200 rounded-2xl p-6 flex items-center gap-5">
            <div className="w-20 h-20 rounded-xl overflow-hidden border border-green-200 flex-shrink-0 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={profile.avatar_url} alt="Your avatar" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <h3 className="font-semibold">Avatar ready</h3>
              </div>
              <p className="text-sm text-gray-700">
                Your avatar has been generated and is available for licensing. Face ID:{" "}
                <span className="font-mono">FL-{String(profile.id).padStart(6, "0")}</span>
              </p>
            </div>
            <a
              href={profile.avatar_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 border border-gray-300 bg-white text-gray-700 px-4 py-2 rounded-lg text-sm hover:border-black hover:text-black transition-colors"
            >
              <Eye className="w-4 h-4" /> View avatar
            </a>
          </div>
        )}

        {/* Current photo preview + guidelines */}
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-8 mb-10">
          <div>
            <div className="aspect-square rounded-2xl border border-gray-200 overflow-hidden bg-gray-50 relative">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt={profile?.name || "Talent photo"} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <User className="w-16 h-16" />
                </div>
              )}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="text-white/20 text-2xl font-bold tracking-wider -rotate-12">FACE LIBRARY</div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
              <Shield className="w-4 h-4" />
              Face ID: {profile ? `FL-${String(profile.id).padStart(6, "0")}` : "—"}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">Capture Guidelines</h2>
            <p className="text-sm text-gray-600 mb-5">
              Follow these guidelines for optimal avatar quality.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
              {GUIDELINES.map(({ icon: Icon, label }) => (
                <div key={label} className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-2">
                    <Icon className="w-6 h-6 text-gray-700" />
                  </div>
                  <p className="text-xs font-medium text-gray-900">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Face Digits */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-semibold">Face Digits</h2>
            <span className="text-sm text-gray-500">
              {faceCount}/{FACE_DIGITS.length} uploaded
            </span>
          </div>
          <p className="text-sm text-gray-600 mb-6">
            Upload {FACE_DIGITS.length} face photos covering different angles and expressions.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {FACE_DIGITS.map((label) => {
              const url = facePhotos[label];
              const slotKey = `face-${label}`;
              const isUploading = uploadingSlot === slotKey;
              const reference = REFERENCE_IMAGES[label];
              return (
                <label
                  key={label}
                  className={`aspect-square rounded-2xl border-2 border-dashed transition-colors cursor-pointer flex flex-col shadow-sm relative overflow-hidden group ${
                    url ? "border-green-500" : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={isUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadSlot(slotKey, file, (url) => setFacePhotos((p) => ({ ...p, [label]: url })));
                    }}
                  />
                  {url ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={label} className="absolute inset-0 w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/30 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Upload className="w-6 h-6 text-white mb-1" />
                        <span className="text-xs text-white">Replace</span>
                      </div>
                      <CheckCircle className="absolute top-2 right-2 w-5 h-5 text-green-600 bg-white rounded-full" />
                    </>
                  ) : (
                    <>
                      {reference && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={reference} alt={`${label} reference`} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover grayscale opacity-60" />
                      )}
                      <div className="absolute inset-0 bg-white/60 group-hover:bg-white/40 transition-colors flex flex-col items-center justify-center gap-2">
                        {isUploading ? (
                          <Loader2 className="w-8 h-8 animate-spin text-gray-700" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center">
                            <Upload className="w-5 h-5 text-gray-700" />
                          </div>
                        )}
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-white/90 text-center py-1.5">
                        <span className="text-xs font-medium text-gray-800">{label}</span>
                      </div>
                    </>
                  )}
                </label>
              );
            })}
          </div>
        </section>

        {/* Face Videos */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-semibold">Face Videos</h2>
            <span className="text-sm text-gray-500">
              {Object.values(faceVideos).filter(Boolean).length}/{FACE_VIDEOS.length} uploaded
            </span>
          </div>
          <p className="text-sm text-gray-600 mb-6">Short face video clips.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {FACE_VIDEOS.map((label) => {
              const url = faceVideos[label];
              const slotKey = `faceVideo-${label}`;
              const isUploading = uploadingSlot === slotKey;
              const reference = REFERENCE_IMAGES[label];
              return (
                <label
                  key={label}
                  className={`aspect-square rounded-2xl border-2 border-dashed transition-colors cursor-pointer flex flex-col shadow-sm relative overflow-hidden group ${
                    url ? "border-green-500" : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    disabled={isUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadSlot(slotKey, file, (url) => setFaceVideos((p) => ({ ...p, [label]: url })));
                    }}
                  />
                  {url ? (
                    <>
                      <video src={url} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
                      <CheckCircle className="absolute top-2 right-2 w-5 h-5 text-green-600 bg-white rounded-full" />
                    </>
                  ) : (
                    <>
                      {reference && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={reference} alt={`${label} reference`} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover grayscale opacity-60" />
                      )}
                      <div className="absolute inset-0 bg-white/60 group-hover:bg-white/40 transition-colors flex flex-col items-center justify-center gap-2">
                        {isUploading ? (
                          <Loader2 className="w-8 h-8 animate-spin text-gray-700" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-black/70 flex items-center justify-center">
                            <Play className="w-5 h-5 text-white ml-0.5" />
                          </div>
                        )}
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-white/90 text-center py-1.5">
                        <span className="text-xs font-medium text-gray-800">{label}</span>
                      </div>
                    </>
                  )}
                </label>
              );
            })}
          </div>
        </section>

        {/* Body Digits */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-semibold">Body Digits</h2>
            <span className="text-sm text-gray-500">
              {bodyCount}/{BODY_DIGITS.length} uploaded
            </span>
          </div>
          <p className="text-sm text-gray-600 mb-6">
            Upload {BODY_DIGITS.length} body photos covering different angles and poses.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {BODY_DIGITS.map((label) => {
              const url = bodyPhotos[label];
              const slotKey = `body-${label}`;
              const isUploading = uploadingSlot === slotKey;
              const reference = REFERENCE_IMAGES[label];
              return (
                <label
                  key={label}
                  className={`aspect-square rounded-2xl border-2 border-dashed transition-colors cursor-pointer flex flex-col shadow-sm relative overflow-hidden group ${
                    url ? "border-green-500" : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={isUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadSlot(slotKey, file, (url) => setBodyPhotos((p) => ({ ...p, [label]: url })));
                    }}
                  />
                  {url ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={label} className="absolute inset-0 w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/30 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Upload className="w-6 h-6 text-white mb-1" />
                        <span className="text-xs text-white">Replace</span>
                      </div>
                      <CheckCircle className="absolute top-2 right-2 w-5 h-5 text-green-600 bg-white rounded-full" />
                    </>
                  ) : (
                    <>
                      {reference && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={reference} alt={`${label} reference`} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover grayscale opacity-60" />
                      )}
                      <div className="absolute inset-0 bg-white/60 group-hover:bg-white/40 transition-colors flex flex-col items-center justify-center gap-2">
                        {isUploading ? (
                          <Loader2 className="w-8 h-8 animate-spin text-gray-700" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center">
                            <Upload className="w-5 h-5 text-gray-700" />
                          </div>
                        )}
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-white/90 text-center py-1.5">
                        <span className="text-xs font-medium text-gray-800">{label}</span>
                      </div>
                    </>
                  )}
                </label>
              );
            })}
          </div>
        </section>

        {/* Body Videos */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-semibold">Body Videos</h2>
            <span className="text-sm text-gray-500">
              {Object.values(bodyVideos).filter(Boolean).length}/{BODY_VIDEOS.length} uploaded
            </span>
          </div>
          <p className="text-sm text-gray-600 mb-6">Short body motion clips.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {BODY_VIDEOS.map((label) => {
              const url = bodyVideos[label];
              const slotKey = `bodyVideo-${label}`;
              const isUploading = uploadingSlot === slotKey;
              const reference = REFERENCE_IMAGES[label];
              return (
                <label
                  key={label}
                  className={`aspect-square rounded-2xl border-2 border-dashed transition-colors cursor-pointer flex flex-col shadow-sm relative overflow-hidden group ${
                    url ? "border-green-500" : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    disabled={isUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadSlot(slotKey, file, (url) => setBodyVideos((p) => ({ ...p, [label]: url })));
                    }}
                  />
                  {url ? (
                    <>
                      <video src={url} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
                      <CheckCircle className="absolute top-2 right-2 w-5 h-5 text-green-600 bg-white rounded-full" />
                    </>
                  ) : (
                    <>
                      {reference && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={reference} alt={`${label} reference`} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover grayscale opacity-60" />
                      )}
                      <div className="absolute inset-0 bg-white/60 group-hover:bg-white/40 transition-colors flex flex-col items-center justify-center gap-2">
                        {isUploading ? (
                          <Loader2 className="w-8 h-8 animate-spin text-gray-700" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-black/70 flex items-center justify-center">
                            <Play className="w-5 h-5 text-white ml-0.5" />
                          </div>
                        )}
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-white/90 text-center py-1.5">
                        <span className="text-xs font-medium text-gray-800">{label}</span>
                      </div>
                    </>
                  )}
                </label>
              );
            })}
          </div>
        </section>

        {/* Identity Video */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-1">Identity Video</h2>
          <p className="text-sm text-gray-600 mb-6">
            Record a short video confirming your identity.
          </p>
          <div className="max-w-2xl">
            <label
              className={`aspect-video rounded-2xl border-2 border-dashed transition-colors cursor-pointer flex flex-col shadow-sm relative overflow-hidden group ${
                identityVideo ? "border-green-500" : "border-gray-200 hover:border-gray-400"
              }`}
            >
              <input
                type="file"
                accept="video/*"
                className="hidden"
                disabled={uploadingSlot === "identity"}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadSlot("identity", file, (url) => setIdentityVideo(url));
                }}
              />
              {identityVideo ? (
                <>
                  <video src={identityVideo} className="absolute inset-0 w-full h-full object-cover" muted playsInline controls />
                  <CheckCircle className="absolute top-3 right-3 w-6 h-6 text-green-600 bg-white rounded-full" />
                </>
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={REFERENCE_IMAGES["Identity Video"]}
                    alt="Identity video reference"
                    className="absolute inset-0 w-full h-full object-cover grayscale opacity-60"
                  />
                  <div className="absolute inset-0 bg-white/70 group-hover:bg-white/50 transition-colors flex flex-col items-center justify-center gap-4 p-8">
                    {uploadingSlot === "identity" ? (
                      <Loader2 className="w-12 h-12 animate-spin text-gray-700" />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-black/80 flex items-center justify-center">
                        <Play className="w-7 h-7 text-white ml-1" />
                      </div>
                    )}
                    <div className="text-center">
                      <p className="text-lg font-semibold text-gray-900 mb-3">Upload Identity Video</p>
                      <div className="text-sm text-gray-700 space-y-1">
                        <p className="italic">&ldquo;Hello, my name is...&rdquo;</p>
                        <p className="italic">&ldquo;I am from...&rdquo;</p>
                        <p className="italic">&ldquo;This video confirms my identity.&rdquo;</p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </label>
          </div>
        </section>

        {/* Portfolio — public showcase on /talent-profile/{id} */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-semibold">Portfolio</h2>
            <span className="text-sm text-gray-500">
              {portfolio.filter(Boolean).length}/3 uploaded
            </span>
          </div>
          <p className="text-sm text-gray-600 mb-6">
            Three portfolio images shown publicly on your profile. Brands see
            these before sending license requests — pick your strongest shots.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl">
            {[0, 1, 2].map((idx) => {
              const url = portfolio[idx];
              const slotKey = `portfolio-${idx}`;
              const isUploading = uploadingSlot === slotKey;
              return (
                <label
                  key={idx}
                  className={`aspect-[3/4] rounded-2xl border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center gap-3 shadow-sm relative overflow-hidden ${
                    url ? "border-green-500 bg-green-50" : "border-gray-300 hover:border-gray-400 bg-white"
                  }`}
                >
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={isUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePortfolioUpload(idx, file);
                    }}
                  />
                  {url ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Portfolio ${idx + 1}`} className="absolute inset-0 w-full h-full object-cover" />
                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                        <div className="text-white/20 text-xl font-bold tracking-wider -rotate-12">FACE LIBRARY</div>
                      </div>
                      <div className="absolute inset-0 bg-black/30 flex flex-col items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <Upload className="w-6 h-6 text-white mb-1" />
                        <span className="text-xs text-white">Replace</span>
                      </div>
                    </>
                  ) : isUploading ? (
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-gray-400" />
                      <span className="text-sm font-medium text-gray-700">Portfolio {idx + 1}</span>
                    </>
                  )}
                </label>
              );
            })}
          </div>
          <div className="mt-4">
            <button
              onClick={handlePortfolioSave}
              disabled={portfolioSaving || portfolio.every((x) => !x)}
              className="inline-flex items-center gap-2 bg-black text-white px-5 py-2 rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50"
            >
              {portfolioSaving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              ) : (
                "Save Portfolio"
              )}
            </button>
          </div>
        </section>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-4 pt-6 border-t border-gray-200">
          <Link
            href="/talent/dashboard"
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:border-gray-900 hover:text-black transition-colors"
          >
            Save Draft
          </Link>
          <button
            onClick={handleGenerate}
            disabled={!canGenerate || submitting}
            className="px-8 py-3 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Starting…
              </>
            ) : hasAvatar ? (
              "Regenerate Avatar"
            ) : (
              "Generate Avatar"
            )}
          </button>
          {!canGenerate && (
            <p className="text-xs text-gray-500">
              Upload at least 5 face photos and 4 body photos to continue.
            </p>
          )}
        </div>
        {error && (
          <p className="text-xs text-red-600 mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
