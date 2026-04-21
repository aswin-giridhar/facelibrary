/**
 * Face Library MVP API Client.
 *
 * Sections: Auth, Talent, Client, Agent, Talent-Agent Linking,
 * Licensing, Contract Agent, Watermark Tracking, Audit, Payments.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem("fl_user");
    if (stored) {
      const user = JSON.parse(stored);
      return user.token || null;
    }
  } catch {}
  return null;
}

async function fetchAPI(path: string, options?: RequestInit) {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error("Too many requests. Please wait a moment and try again.");
    }
    if (res.status === 401) {
      // Clear stale auth on 401
      if (typeof window !== "undefined") {
        localStorage.removeItem("fl_user");
      }
      throw new Error("Session expired. Please log in again.");
    }
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || "API Error");
  }
  return res.json();
}

// Auth
export const signup = (data: { email: string; password: string; name: string; role: string; company?: string }) =>
  fetchAPI("/api/auth/signup", { method: "POST", body: JSON.stringify(data) });

export const login = (data: { email: string; password: string }) =>
  fetchAPI("/api/auth/login", { method: "POST", body: JSON.stringify(data) });

export const getMe = (userId: number) => fetchAPI(`/api/auth/me/${userId}`);

// Talent
export const registerTalent = (data: Record<string, unknown>) =>
  fetchAPI("/api/talent/register", { method: "POST", body: JSON.stringify(data) });

export const getTalent = (id: number) => fetchAPI(`/api/talent/${id}`);

export const listTalents = () => fetchAPI("/api/talents");

export const updateTalentPreferences = (id: number, data: Record<string, unknown>) =>
  fetchAPI(`/api/talent/${id}/preferences`, { method: "PUT", body: JSON.stringify(data) });

export const getTalentRequests = (id: number) => fetchAPI(`/api/talent/${id}/requests`);

export const uploadTalentImage = async (talentId: number, file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/api/talent/${talentId}/upload-image`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("Upload failed");
  return res.json();
};

// Client (renamed from Brand)
export const registerClient = (data: Record<string, unknown>) =>
  fetchAPI("/api/client/register", { method: "POST", body: JSON.stringify(data) });

export const getClient = (id: number) => fetchAPI(`/api/client/${id}`);

export const getClientRequests = (id: number) => fetchAPI(`/api/client/${id}/requests`);

// Backward compat
export const registerBrand = registerClient;
export const getBrand = getClient;
export const getBrandRequests = getClientRequests;

// Agent
export const registerAgent = (data: Record<string, unknown>) =>
  fetchAPI("/api/agent/register", { method: "POST", body: JSON.stringify(data) });

export const getAgent = (id: number) => fetchAPI(`/api/agent/${id}`);

export const getAgentRequests = (id: number) => fetchAPI(`/api/agent/${id}/requests`);

// Talent-Agent Linking
export const linkTalentAgent = (data: { talent_id: number; agent_id: number; approval_type?: string }) =>
  fetchAPI("/api/talent-agent/link", { method: "POST", body: JSON.stringify(data) });

export const unlinkTalentAgent = (linkId: number) =>
  fetchAPI(`/api/talent-agent/link/${linkId}`, { method: "DELETE" });

export const getAgentLinks = (agentId: number) => fetchAPI(`/api/talent-agent/links/${agentId}`);

// Licensing
export const createLicenseRequest = (data: Record<string, unknown>) =>
  fetchAPI("/api/licensing/request", { method: "POST", body: JSON.stringify(data) });

export const getLicense = (id: number) => fetchAPI(`/api/licensing/${id}`);

export const approveLicense = (id: number, approved: boolean) =>
  fetchAPI(`/api/licensing/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ approved }),
  });

export const listLicenses = () => fetchAPI("/api/licenses");

// Contract Agent
export const generateContract = (licenseId: number) =>
  fetchAPI(`/api/licensing/${licenseId}/generate-contract`, { method: "POST" });

export const validateContract = (licenseId: number) =>
  fetchAPI(`/api/licensing/${licenseId}/validate-contract`, { method: "POST" });

export const improveContract = (licenseId: number, feedback: string) =>
  fetchAPI(`/api/licensing/${licenseId}/improve-contract`, {
    method: "POST",
    body: JSON.stringify({ feedback }),
  });

// Manual Review
export const reviewLicense = (licenseId: number, data: { status: string; admin_notes?: string; reviewed_by?: string }) =>
  fetchAPI(`/api/licensing/${licenseId}/review`, { method: "POST", body: JSON.stringify(data) });

// Watermark Tracking
export const reportWatermark = (data: Record<string, unknown>) =>
  fetchAPI("/api/watermark/report", { method: "POST", body: JSON.stringify(data) });

export const getWatermarkByLicense = (licenseId: number) =>
  fetchAPI(`/api/watermark/license/${licenseId}`);

export const getWatermarkByTalent = (talentId: number) =>
  fetchAPI(`/api/watermark/talent/${talentId}`);

// Audit
export const getAuditTrail = (licenseId: number) => fetchAPI(`/api/audit/${licenseId}`);

export const getAllAuditLogs = () => fetchAPI("/api/audit/logs");

// Payments (Stripe)
export const createCheckoutSession = (licenseId: number) =>
  fetchAPI("/api/payments/checkout", {
    method: "POST",
    body: JSON.stringify({
      license_id: licenseId,
      success_url: `${typeof window !== "undefined" ? window.location.origin : ""}/license/${licenseId}?paid=true`,
      cancel_url: `${typeof window !== "undefined" ? window.location.origin : ""}/license/${licenseId}`,
    }),
  });

export const getRevenue = () => fetchAPI("/api/payments/revenue");

// License Templates
export const getLicenseTemplates = () => fetchAPI("/api/license-templates");

// Health
export const getHealth = () => fetchAPI("/api/health");

// AI Chat (real LLM via Kimi K2 Thinking)
export type ChatVariant = "client" | "agent" | "talent";
export type ChatMessage = { role: "user" | "assistant"; content: string };

export const postChat = (variant: ChatVariant, messages: ChatMessage[]) =>
  fetchAPI("/api/chat", {
    method: "POST",
    body: JSON.stringify({ variant, messages }),
  }) as Promise<{ reply: string; model: string; tokens_used: number }>;

// Email verification
export const resendVerification = (email: string) =>
  fetchAPI("/api/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

export const getVerificationStatus = () =>
  fetchAPI("/api/auth/verification-status") as Promise<{ verified: boolean }>;

// Payouts
export const getEarnings = () =>
  fetchAPI("/api/payouts/earnings") as Promise<{
    gross_revenue: number;
    total_earned: number;
    paid_out: number;
    pending_payout: number;
    available_balance: number;
  }>;

export const listPayouts = () => fetchAPI("/api/payouts/list");

export const requestPayout = (data: {
  amount: number;
  bank_account_ref?: string;
  notes?: string;
}) =>
  fetchAPI("/api/payouts/request", {
    method: "POST",
    body: JSON.stringify(data),
  });

// Avatar generation jobs
export const submitAvatarJob = (data: {
  face_photo_count: number;
  body_photo_count: number;
  identity_video_ref?: string;
}) =>
  fetchAPI("/api/talent/avatar/submit", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const getAvatarJob = (jobId: number) =>
  fetchAPI(`/api/talent/avatar/${jobId}`);
