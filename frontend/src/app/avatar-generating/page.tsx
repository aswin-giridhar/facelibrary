"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, CheckCircle, Sparkles, AlertTriangle } from "lucide-react";
import { getAvatarJob } from "@/lib/api";

const steps = [
  "Analyzing face photos...",
  "Extracting facial features...",
  "Processing body proportions...",
  "Building 3D mesh...",
  "Generating textures...",
  "Applying likeness mapping...",
  "Finalizing avatar...",
];

type JobStatus = "processing" | "completed" | "failed";

interface Job {
  id: number;
  status: JobStatus;
  output_avatar_url: string | null;
  model_used: string | null;
  error_message: string | null;
  created_at: string;
}

function AvatarGeneratingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobIdParam = searchParams.get("jobId");
  const jobId = jobIdParam ? parseInt(jobIdParam) : null;

  const [job, setJob] = useState<Job | null>(null);
  const [elapsedPct, setElapsedPct] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Without a jobId we can't poll anything — send the user back to the form.
  useEffect(() => {
    if (!jobId) {
      router.replace("/create-avatar");
    }
  }, [jobId, router]);

  // Poll the job every 2s until it completes or fails.
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const j = (await getAvatarJob(jobId)) as Job;
        if (cancelled) return;
        setJob(j);
        if (j.status === "processing") {
          setTimeout(poll, 2000);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to fetch avatar status");
      }
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  // Smooth progress bar — target 90% while processing, jump to 100 on completion.
  useEffect(() => {
    if (!job) return;
    if (job.status === "completed") {
      setElapsedPct(100);
      return;
    }
    if (job.status === "failed") return;
    const tick = setInterval(() => {
      setElapsedPct((prev) => (prev < 90 ? prev + 1 : prev));
    }, 150);
    return () => clearInterval(tick);
  }, [job]);

  const currentStep = Math.min(
    Math.floor(elapsedPct / (100 / steps.length)),
    steps.length - 1,
  );

  const complete = job?.status === "completed";
  const failed = job?.status === "failed" || !!error;

  return (
    <div className="min-h-screen bg-white flex items-center justify-center py-12 px-6">
      <div className="w-full max-w-lg text-center">
        <Link href="/" className="inline-flex items-center gap-2 mb-10">
          <div className="w-10 h-10 bg-black text-white flex items-center justify-center text-sm font-bold">FL</div>
          <span className="font-semibold text-lg tracking-wide">FACE LIBRARY</span>
        </Link>

        {failed ? (
          <>
            <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-8">
              <AlertTriangle className="w-12 h-12 text-red-600" />
            </div>
            <h1 className="text-2xl font-semibold mb-3">Avatar Generation Failed</h1>
            <p className="text-gray-600 mb-8 bg-red-50 border border-red-200 rounded-lg p-4 text-sm">
              {error || job?.error_message || "Something went wrong. Please try again."}
            </p>
            <button
              onClick={() => router.push("/create-avatar")}
              className="w-full bg-black text-white py-3 px-6 rounded-lg font-medium hover:bg-gray-800 transition-colors"
            >
              Back to Upload
            </button>
          </>
        ) : !complete ? (
          <>
            <div className="w-24 h-24 mx-auto mb-8 relative">
              <div className="absolute inset-0 rounded-full border-4 border-gray-200" />
              <div
                className="absolute inset-0 rounded-full border-4 border-black border-t-transparent animate-spin"
                style={{ animationDuration: "1.5s" }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-black" />
              </div>
            </div>

            <h1 className="text-2xl font-semibold mb-3">Generating Your Avatar</h1>
            <p className="text-gray-600 mb-8">
              This may take a few minutes. Please don&apos;t close this page.
            </p>

            <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
              <div
                className="bg-black h-2 rounded-full transition-all duration-300"
                style={{ width: `${elapsedPct}%` }}
              />
            </div>
            <p className="text-sm text-gray-500 mb-6">{elapsedPct}% complete</p>

            <div className="bg-gray-50 rounded-xl p-6 text-left">
              <div className="space-y-3">
                {steps.map((step, i) => (
                  <div key={step} className="flex items-center gap-3">
                    {i < currentStep ? (
                      <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                    ) : i === currentStep ? (
                      <Loader2 className="w-5 h-5 text-black animate-spin flex-shrink-0" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
                    )}
                    <span className={`text-sm ${i <= currentStep ? "text-black font-medium" : "text-gray-400"}`}>
                      {step}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-8">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>

            <h1 className="text-2xl font-semibold mb-3">Avatar Created!</h1>
            <p className="text-gray-600 mb-8">
              Your digital likeness has been generated successfully. You can view and manage it from your dashboard.
            </p>

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-8">
              <div className="grid grid-cols-3 gap-4 mb-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="aspect-square bg-white border border-gray-200 rounded-lg overflow-hidden">
                    {job?.output_avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={job.output_avatar_url} alt="Avatar preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Sparkles className="w-8 h-8 text-gray-400" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {job?.model_used && (
                <p className="text-xs text-gray-500 text-center">
                  Generated by {job.model_used}
                </p>
              )}
            </div>

            <button
              onClick={() => router.push("/talent/dashboard")}
              className="w-full bg-black text-white py-3 px-6 rounded-lg font-medium hover:bg-gray-800 transition-colors"
            >
              Go to Dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function AvatarGeneratingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-black border-t-transparent" />
        </div>
      }
    >
      <AvatarGeneratingContent />
    </Suspense>
  );
}
