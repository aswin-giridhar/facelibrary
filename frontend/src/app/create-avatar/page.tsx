"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Upload, Sun, Image as ImageIcon, Sparkles, Eye, Wind, Glasses, Smile, Loader2 } from "lucide-react";
import { submitAvatarJob } from "@/lib/api";

const faceDigits = [
  "Front", "Left Profile", "Right Profile", "3/4 Left",
  "3/4 Right", "Head Up", "Head Down", "Neutral",
  "Smile", "Eyes Closed", "Eyes Open", "Back Head",
];

const faceVideos = ["Neutral Talking", "Smile", "Turn Head"];

const bodyDigits = [
  "Full Body Front", "Left", "Right", "Back",
  "3/4 Left", "3/4 Right", "Walking", "Turn 360",
];

const guidelines = [
  { icon: Sun, label: "Natural Lighting" },
  { icon: ImageIcon, label: "White Background" },
  { icon: Sparkles, label: "No Filters" },
  { icon: Eye, label: "Face Fully Visible" },
  { icon: Wind, label: "Hair Away from Face" },
  { icon: Glasses, label: "No Sunglasses" },
  { icon: Smile, label: "Neutral Expression" },
];

export default function CreateAvatarPage() {
  const router = useRouter();
  const [facePhotos, setFacePhotos] = useState<Record<string, boolean>>({});
  const [bodyPhotos, setBodyPhotos] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const faceCount = Object.values(facePhotos).filter(Boolean).length;
  const bodyCount = Object.values(bodyPhotos).filter(Boolean).length;
  const canGenerate = faceCount >= 5 && bodyCount >= 4;

  const handleGenerate = async () => {
    if (submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const job = await submitAvatarJob({
        face_photo_count: faceCount,
        body_photo_count: bodyCount,
      });
      router.push(`/avatar-generating?jobId=${job.id}`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Failed to start avatar generation");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-[1400px] mx-auto px-8 py-6">
          <button
            onClick={() => router.push("/talent/dashboard")}
            className="flex items-center gap-2 text-gray-600 hover:text-black mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Back to Dashboard</span>
          </button>
          <div>
            <h1 className="text-3xl font-bold mb-2">Create Your Avatar</h1>
            <p className="text-gray-600">
              Upload photos of your face and body so we can generate your digital likeness.
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-8 py-8">
        {/* Capture Guidelines */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 mb-8">
          <h2 className="text-xl font-bold mb-4">Capture Guidelines</h2>
          <p className="text-sm text-gray-600 mb-6">Follow these guidelines for optimal avatar quality</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {guidelines.map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center text-center">
                <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                  <Icon className="w-7 h-7 text-gray-700" />
                </div>
                <p className="text-sm font-medium text-gray-900">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Face Digits */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-bold">Face Digits</h2>
            <span className="text-sm text-gray-500">{faceCount}/12 uploaded</span>
          </div>
          <p className="text-sm text-gray-600 mb-6">
            Upload 12 face photos covering different angles and expressions
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {faceDigits.map((label) => (
              <label
                key={label}
                className={`aspect-square bg-white rounded-2xl border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center gap-3 shadow-sm ${
                  facePhotos[label] ? "border-green-500 bg-green-50" : "border-gray-300 hover:border-gray-400"
                }`}
              >
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) setFacePhotos((prev) => ({ ...prev, [label]: true }));
                  }}
                />
                <Upload className={`w-8 h-8 ${facePhotos[label] ? "text-green-600" : "text-gray-400"}`} />
                <span className="text-sm font-medium text-gray-700 text-center px-3 leading-tight">
                  {label}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Face Video */}
        <div className="mb-12">
          <h2 className="text-xl font-bold mb-1">Face Video</h2>
          <p className="text-sm text-gray-600 mb-6">Short face video clips</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {faceVideos.map((label) => (
              <div
                key={label}
                className="aspect-square bg-white rounded-2xl border-2 border-dashed border-gray-300 hover:border-gray-400 transition-colors cursor-pointer flex flex-col items-center justify-center gap-3 shadow-sm"
              >
                <Upload className="w-8 h-8 text-gray-400" />
                <span className="text-sm font-medium text-gray-700 text-center px-3 leading-tight">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Body Digits */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-bold">Body Digits</h2>
            <span className="text-sm text-gray-500">{bodyCount}/8 uploaded</span>
          </div>
          <p className="text-sm text-gray-600 mb-6">
            Upload 8 body photos covering different angles and poses
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {bodyDigits.map((label) => (
              <label
                key={label}
                className={`aspect-square bg-white rounded-2xl border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center gap-3 shadow-sm ${
                  bodyPhotos[label] ? "border-green-500 bg-green-50" : "border-gray-300 hover:border-gray-400"
                }`}
              >
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) setBodyPhotos((prev) => ({ ...prev, [label]: true }));
                  }}
                />
                <Upload className={`w-8 h-8 ${bodyPhotos[label] ? "text-green-600" : "text-gray-400"}`} />
                <span className="text-sm font-medium text-gray-700 text-center px-3 leading-tight">
                  {label}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Identity Video */}
        <div className="mb-12">
          <h2 className="text-xl font-bold mb-1">Identity Video</h2>
          <p className="text-sm text-gray-600 mb-6">Record a video confirming identity</p>
          <div className="max-w-2xl">
            <div className="aspect-video bg-white rounded-2xl border-2 border-dashed border-gray-300 hover:border-gray-400 transition-colors cursor-pointer flex flex-col items-center justify-center gap-4 shadow-sm p-8">
              <Upload className="w-12 h-12 text-gray-400" />
              <div className="text-center">
                <p className="text-lg font-semibold text-gray-700 mb-3">Record Video</p>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>Example script:</p>
                  <p className="italic">&ldquo;Hello, my name is...&rdquo;</p>
                  <p className="italic">&ldquo;I am from...&rdquo;</p>
                  <p className="italic">&ldquo;This video confirms my identity.&rdquo;</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-4 pt-6 border-t border-gray-200">
          <button
            onClick={() => router.push("/talent/dashboard")}
            disabled={submitting}
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:border-gray-900 hover:text-black transition-colors disabled:opacity-50"
          >
            Save Draft
          </button>
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
            ) : (
              "Generate Avatar"
            )}
          </button>
          {!canGenerate && (
            <p className="text-xs text-gray-500">
              Upload at least 5 face photos and 4 body photos to continue
            </p>
          )}
        </div>
        {submitError && (
          <p className="text-xs text-red-600 mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
            {submitError}
          </p>
        )}

        <p className="text-xs text-gray-500 text-center mt-4">
          Your avatar will be generated using AI after verification.
        </p>
      </div>
    </div>
  );
}
