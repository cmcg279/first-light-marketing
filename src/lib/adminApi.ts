import type {
  AdminLead,
  AuditReport,
  AuditSettings,
  BlogPost,
  ManagedSiteContent,
  MediaAsset,
  PresenceRun,
  PresenceRunInput,
  PresenceSpendSummary,
} from "../types/admin";

const ADMIN_TOKEN_KEY = "first-light-admin-token";
const ADMIN_PKCE_VERIFIER_KEY = "first-light-admin-pkce-verifier";
const ADMIN_AUTH_STATE_KEY = "first-light-admin-auth-state";
const API_BASE_URL = (import.meta.env.VITE_ADMIN_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export interface AdminAuthConfig {
  cognitoDomain: string;
  clientId: string;
  redirectUri: string;
  logoutUri: string;
}

export function getAdminToken() {
  return window.localStorage.getItem(ADMIN_TOKEN_KEY) || "";
}

export function setAdminToken(token: string) {
  window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken() {
  window.localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export async function getAdminAuthConfig() {
  return request<AdminAuthConfig>("/api/auth/config", {
    method: "GET",
  });
}

export async function startAdminLogin() {
  const config = await getAdminAuthConfig();
  assertAuthConfig(config);

  const verifier = randomString(64);
  const state = randomString(32);
  const challenge = await pkceChallenge(verifier);

  window.sessionStorage.setItem(ADMIN_PKCE_VERIFIER_KEY, verifier);
  window.sessionStorage.setItem(ADMIN_AUTH_STATE_KEY, state);

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    scope: "openid email profile",
    redirect_uri: config.redirectUri,
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
  });

  window.location.assign(`${config.cognitoDomain}/oauth2/authorize?${params.toString()}`);
}

export async function completeAdminLogin(code: string, state: string) {
  const verifier = window.sessionStorage.getItem(ADMIN_PKCE_VERIFIER_KEY) || "";
  const expectedState = window.sessionStorage.getItem(ADMIN_AUTH_STATE_KEY) || "";

  window.sessionStorage.removeItem(ADMIN_PKCE_VERIFIER_KEY);
  window.sessionStorage.removeItem(ADMIN_AUTH_STATE_KEY);

  if (!verifier || !expectedState || expectedState !== state) {
    throw new Error("Login session expired. Please try again.");
  }

  const config = await getAdminAuthConfig();
  assertAuthConfig(config);

  const response = await fetch(`${config.cognitoDomain}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      code,
      redirect_uri: config.redirectUri,
      code_verifier: verifier,
    }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok || typeof body.access_token !== "string") {
    throw new Error(body.error_description || "Could not complete login.");
  }

  setAdminToken(body.access_token);
  return body.access_token;
}

export async function logoutAdmin() {
  const token = getAdminToken();
  clearAdminToken();

  const config = await getAdminAuthConfig().catch(() => undefined);
  if (!token || !config?.cognitoDomain || !config.clientId || !config.logoutUri) {
    return;
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    logout_uri: config.logoutUri,
  });

  window.location.assign(`${config.cognitoDomain}/logout?${params.toString()}`);
}

export async function getAdminLeads() {
  const result = await request<{ leads: AdminLead[] }>("/api/admin/leads", {
    headers: authHeaders(),
  });

  return result.leads;
}

export async function getManagedContent() {
  return request<ManagedSiteContent>("/api/admin/content", {
    headers: authHeaders(),
  });
}

export async function saveManagedContent(content: ManagedSiteContent) {
  return request<ManagedSiteContent>("/api/admin/content", {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(content),
  });
}

export async function updateLeadStatus(id: string, responded: boolean) {
  const result = await request<{ lead: AdminLead }>("/api/admin/leads", {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ id, responded }),
  });

  return result.lead;
}

export async function deleteLead(id: string) {
  return request<{ success: boolean }>("/api/admin/leads", {
    method: "DELETE",
    headers: authHeaders(),
    body: JSON.stringify({ id }),
  });
}

export async function getAdminBlogPosts() {
  const result = await request<{ posts: BlogPost[] }>("/api/admin/blog", {
    headers: authHeaders(),
  });

  return result.posts;
}

export async function saveBlogPost(post: BlogPost) {
  const result = await request<{ post: BlogPost }>("/api/admin/blog", {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(post),
  });

  return result.post;
}

export async function deleteBlogPost(slug: string) {
  return request<{ success: boolean }>("/api/admin/blog", {
    method: "DELETE",
    headers: authHeaders(),
    body: JSON.stringify({ slug }),
  });
}

export async function getMediaAssets() {
  const result = await request<{ assets: MediaAsset[] }>("/api/admin/media", {
    headers: authHeaders(),
  });

  return result.assets;
}

export async function uploadMediaAsset(file: File) {
  const result = await request<{ uploadUrl: string; asset: MediaAsset }>("/api/admin/uploads", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type,
    }),
  });

  const uploadResponse = await fetch(result.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type,
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error("Image upload failed.");
  }

  return result.asset;
}

export async function getAuditSettings() {
  return request<AuditSettings>("/api/admin/audit/settings", {
    headers: authHeaders(),
  });
}

export async function saveAuditSettings(settings: Partial<AuditSettings> & { deepseekKey?: string }) {
  return request<AuditSettings>("/api/admin/audit/settings", {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(settings),
  });
}

export async function getAuditReports() {
  const result = await request<{ reports: AuditReport[] }>("/api/admin/audit/reports", {
    headers: authHeaders(),
  });

  return result.reports;
}

export async function createAuditReport(input: {
  handle: string;
  postLimit: number;
  recommendationsEnabled: boolean;
  aiEnabled: boolean;
}) {
  const result = await request<{ report: AuditReport }>("/api/admin/audit/reports", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });

  return result.report;
}

export async function deleteAuditReport(id: string) {
  return request<{ success: boolean }>("/api/admin/audit/reports", {
    method: "DELETE",
    headers: authHeaders(),
    body: JSON.stringify({ id }),
  });
}

export async function getAuditReportDownloadUrl(id: string) {
  const result = await request<{ downloadUrl: string }>("/api/admin/audit/reports/download", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ id }),
  });

  return result.downloadUrl;
}

export async function uploadAuditReportPdf(id: string, file: File) {
  if (file.type && file.type !== "application/pdf") {
    throw new Error("Please upload a PDF file.");
  }

  const result = await request<{ uploadUrl: string; s3Key: string }>("/api/admin/audit/reports/upload", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ id }),
  });

  const uploadResponse = await fetch(result.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/pdf",
      "x-amz-server-side-encryption": "AES256",
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error("Report upload failed.");
  }

  const completed = await request<{ report: AuditReport }>("/api/admin/audit/reports/complete-upload", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ id, s3Key: result.s3Key }),
  });

  return completed.report;
}

export async function getPresenceRuns() {
  return request<{ runs: PresenceRun[]; spend: PresenceSpendSummary }>("/api/admin/presence/runs", {
    headers: authHeaders(),
  });
}

export async function getPresenceRun(id: string) {
  return request<{ run: PresenceRun; spend: PresenceSpendSummary }>(`/api/admin/presence/runs/${id}`, {
    headers: authHeaders(),
  });
}

export async function createPresenceRun(input: PresenceRunInput) {
  return request<{ run: PresenceRun; spend: PresenceSpendSummary }>("/api/admin/presence/runs", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
}

export async function cancelPresenceRun(id: string) {
  return request<{ run: PresenceRun; spend: PresenceSpendSummary }>(`/api/admin/presence/runs/${id}/cancel`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({}),
  });
}

export async function retryPresenceRun(id: string) {
  return request<{ run: PresenceRun; spend: PresenceSpendSummary }>(`/api/admin/presence/runs/${id}/retry`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({}),
  });
}

export async function getPresenceDownloadUrl(id: string) {
  const result = await request<{ downloadUrl: string; expiresIn: number }>(
    `/api/admin/presence/runs/${id}/download`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    },
  );

  return result.downloadUrl;
}

export async function getPublicContent() {
  return request<ManagedSiteContent>("/api/content", {
    method: "GET",
  });
}

export async function getPublicBlogPosts() {
  const result = await request<{ posts: BlogPost[] }>("/api/blog", {
    method: "GET",
  });

  return result.posts;
}

export async function getPublicBlogPost(slug: string) {
  const result = await request<{ post: BlogPost }>(`/api/blog/${slug}`, {
    method: "GET",
  });

  return result.post;
}

function authHeaders() {
  return {
    "X-First-Light-Authorization": `Bearer ${getAdminToken()}`,
  };
}

function assertAuthConfig(config: AdminAuthConfig) {
  if (!config.cognitoDomain || !config.clientId || !config.redirectUri) {
    throw new Error("Cognito admin login is not configured yet.");
  }
}

function randomString(length: number) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const values = new Uint8Array(length);
  window.crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

async function pkceChallenge(verifier: string) {
  const hash = await window.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );

  return base64UrlEncode(new Uint8Array(hash));
}

async function sha256Hex(body: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const requestBody = typeof init.body === "string" ? init.body : undefined;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    body: requestBody,
    headers: {
      "Content-Type": "application/json",
      ...(requestBody !== undefined ? { "x-amz-content-sha256": await sha256Hex(requestBody) } : {}),
      ...init.headers,
    },
  });

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      response.ok
        ? "The server returned a page instead of JSON. The API call did not succeed."
        : `Request failed (${response.status}). The server did not return JSON.`,
    );
  }

  const body = await response.json().catch(() => {
    throw new Error("The server returned invalid JSON.");
  });

  if (!response.ok) {
    throw new Error(body.error || `Request failed (${response.status}).`);
  }

  return body as T;
}
