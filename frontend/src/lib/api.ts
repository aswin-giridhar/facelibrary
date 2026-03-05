const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchAPI(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || "API Error");
  }
  return res.json();
}

// Auth
export const signup = (data: { email: string; password: string; name: string; role: string; company_name?: string }) =>
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

// Brand
export const registerBrand = (data: Record<string, unknown>) =>
  fetchAPI("/api/brand/register", { method: "POST", body: JSON.stringify(data) });

export const getBrand = (id: number) => fetchAPI(`/api/brand/${id}`);

export const getBrandRequests = (id: number) => fetchAPI(`/api/brand/${id}/requests`);

// Licensing
export const createLicenseRequest = (data: Record<string, unknown>) =>
  fetchAPI("/api/licensing/request", { method: "POST", body: JSON.stringify(data) });

export const processLicense = (id: number) =>
  fetchAPI(`/api/licensing/${id}/process`, { method: "POST" });

export const getLicense = (id: number) => fetchAPI(`/api/licensing/${id}`);

export const approveLicense = (id: number, approved: boolean, notes?: string) =>
  fetchAPI(`/api/licensing/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ approved, notes }),
  });

export const listLicenses = () => fetchAPI("/api/licenses");

// Search
export const searchTalent = (query: string, filters?: Record<string, unknown>) =>
  fetchAPI("/api/talent/search", {
    method: "POST",
    body: JSON.stringify({ query, ...filters }),
  });

// Agents
export const getAgentsStatus = () => fetchAPI("/api/agents/status");

export const getAuditTrail = (licenseId: number) =>
  fetchAPI(`/api/audit/${licenseId}`);

export const getAllAuditLogs = () => fetchAPI("/api/audit/logs");

// Health
export const getHealth = () => fetchAPI("/api/health");
