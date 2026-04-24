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
  face_photo_urls?: string[];
  face_video_urls?: string[];
  body_photo_urls?: string[];
  identity_video_url?: string;
}) =>
  fetchAPI("/api/talent/avatar/submit", {
    method: "POST",
    body: JSON.stringify(data),
  });

// File uploads (avatar photos, portfolio images, identity video).
// Returns { url, path, size }. Pass the returned URL into submitAvatarJob /
// setTalentPortfolio to persist it.
export async function uploadPhoto(
  file: File,
  opts: { purpose?: "avatar" | "portfolio"; slot?: string } = {}
): Promise<{ url: string; path: string; size: number }> {
  const token = getToken();
  const fd = new FormData();
  fd.append("file", file);
  const qs = new URLSearchParams({
    purpose: opts.purpose || "avatar",
    ...(opts.slot ? { slot: opts.slot } : {}),
  });
  const res = await fetch(`${API_BASE}/api/uploads/photo?${qs.toString()}`, {
    method: "POST",
    body: fd,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Upload failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

// Talent portfolio
export const getTalentPortfolio = (talentId: number): Promise<string[]> =>
  fetchAPI(`/api/talents/${talentId}/portfolio`);

export const setTalentPortfolio = (talentId: number, images: string[]) =>
  fetchAPI(`/api/talents/${talentId}/portfolio`, {
    method: "POST",
    body: JSON.stringify({ images }),
  });

// Contract signing
export interface ContractStatus {
  has_contract: boolean;
  is_signed: boolean;
  signed_at: string | null;
  contract_id?: number;
}
export const getContractStatus = (licenseId: number): Promise<ContractStatus> =>
  fetchAPI(`/api/licensing/${licenseId}/contract-status`);

export const signContract = (licenseId: number) =>
  fetchAPI(`/api/licensing/${licenseId}/sign`, { method: "POST" });

export const getAvatarJob = (jobId: number) =>
  fetchAPI(`/api/talent/avatar/${jobId}`);

// Messages
export interface ConversationSummary {
  id: number;
  subject: string | null;
  other_user: { id: number; email?: string; role?: string };
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
}

export interface Message {
  id: number;
  conversation_id: number;
  sender_id: number;
  body: string;
  created_at: string;
  read_at: string | null;
}

export const listConversations = (): Promise<ConversationSummary[]> =>
  fetchAPI("/api/conversations");

export const createConversation = (data: {
  other_user_id: number;
  subject?: string;
  initial_message?: string;
}): Promise<{ conversation_id: number }> =>
  fetchAPI("/api/conversations", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const getMessages = (convId: number): Promise<Message[]> =>
  fetchAPI(`/api/conversations/${convId}/messages`);

export const sendMessage = (convId: number, body: string): Promise<Message> =>
  fetchAPI(`/api/conversations/${convId}/messages`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });

// Activity feed
export interface ActivityItem {
  id: number;
  action: string;
  user_id: number | null;
  license_id: number | null;
  details: string | null;
  created_at: string;
}

export const getActivityFeed = (limit = 30): Promise<ActivityItem[]> =>
  fetchAPI(`/api/activity?limit=${limit}`);

// Tax documents
export interface TaxDocument {
  id: number;
  user_id: number;
  document_type: string;
  tax_year: number;
  status: string;
  file_url: string | null;
  generated_at: string | null;
  created_at: string;
}

export const listTaxDocuments = (): Promise<TaxDocument[]> =>
  fetchAPI("/api/tax-documents");

export const requestTaxDocument = (data: {
  document_type: string;
  tax_year: number;
}): Promise<TaxDocument> =>
  fetchAPI("/api/tax-documents/request", {
    method: "POST",
    body: JSON.stringify(data),
  });

// Bank account details (for payouts)
export interface BankDetails {
  account_holder_name: string;
  bank_name?: string | null;
  account_number_last4?: string | null;
  sort_code?: string | null;
  routing_number?: string | null;
  iban_last4?: string | null;
  country?: string | null;
}

export const getBankDetails = (): Promise<BankDetails | null> =>
  fetchAPI("/api/bank-details");

export const updateBankDetails = (data: {
  account_holder_name: string;
  bank_name?: string;
  account_number?: string;
  sort_code?: string;
  routing_number?: string;
  iban?: string;
  country?: string;
}): Promise<{ ok: boolean }> =>
  fetchAPI("/api/bank-details", {
    method: "POST",
    body: JSON.stringify(data),
  });

// Talent pricing tiers (per-surface prices shown on talent profile)
export interface PricingTiers {
  social?: number | null;
  website?: number | null;
  print?: number | null;
  tv?: number | null;
}

export const getTalentPricing = (talentId: number): Promise<PricingTiers> =>
  fetchAPI(`/api/talents/${talentId}/pricing`);

export const setTalentPricing = (talentId: number, data: PricingTiers) =>
  fetchAPI(`/api/talents/${talentId}/pricing`, {
    method: "POST",
    body: JSON.stringify(data),
  });

// Multi-role detection: which profiles does the current user hold?
export interface UserRoles {
  primary_role: string;
  roles: { role: string; profile_id: number }[];
}

export const getMyRoles = (): Promise<UserRoles> => fetchAPI("/api/auth/roles");
