import { dnsRecords, domains, type Domain } from "@/lib/mock-dns";

/** Locally-computed dashboard payload, used when the API is unreachable. */
function mockDashboard() {
  return {
    domains,
    records: dnsRecords,
    stats: {
      activeDomains: domains.filter((domain) => domain.status === "Active").length,
      managedRecords: domains.reduce((total, domain) => total + domain.records, 0),
      nameservers: 2,
      attentionItems: domains.filter((domain) => domain.status === "Attention").length,
    },
  };
}

export type DashboardData = ReturnType<typeof mockDashboard>;

export type ApiKeySummary = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export type CreateApiKeyResponse = {
  key: ApiKeySummary;
  secret: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL ?? "http://localhost:3001";

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

async function readApiError(res: Response): Promise<string> {
  try {
    const payload = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(payload.message)) return payload.message.join(", ");
    if (payload.message) return payload.message;
  } catch {
    // ignore
  }
  return `Request failed (${res.status})`;
}

/**
 * Fetches the dashboard payload from the NestJS API (GET /api/dashboard).
 * Falls back to local mock data so the console still renders when the backend
 * (or PowerDNS/Postgres) isn't running yet.
 */
export async function getDashboardData(accessToken: string) {
  try {
    const res = await fetch(`${API_URL}/api/dashboard`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
      headers: authHeaders(accessToken),
    });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return (await res.json()) as DashboardData;
  } catch {
    return mockDashboard();
  }
}

export async function createDomain(
  accessToken: string,
  input: { name: string; owner: string },
): Promise<Domain> {
  const res = await fetch(`${API_URL}/api/domains`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(await readApiError(res));
  }

  return (await res.json()) as Domain;
}

export async function listApiKeys(accessToken: string): Promise<ApiKeySummary[]> {
  const res = await fetch(`${API_URL}/api/api-keys`, {
    headers: authHeaders(accessToken),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(await readApiError(res));
  }

  return (await res.json()) as ApiKeySummary[];
}

export async function createApiKey(
  accessToken: string,
  name: string,
): Promise<CreateApiKeyResponse> {
  const res = await fetch(`${API_URL}/api/api-keys`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ name }),
  });

  if (!res.ok) {
    throw new Error(await readApiError(res));
  }

  return (await res.json()) as CreateApiKeyResponse;
}

export async function revokeApiKey(accessToken: string, id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/api-keys/${id}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
}

export type SmtpConfig = {
  relay: {
    host: string;
    username: string;
    ports: {
      submission: { port: number; encryption: string; label: string; recommended?: boolean };
      implicitTls: { port: number; encryption: string; label: string; recommended?: boolean };
    };
  };
  credential: {
    configured: boolean;
    prefix: string | null;
    createdAt: string | null;
    lastUsedAt: string | null;
  };
  sender: {
    fromEmail: string;
    fromName: string;
  };
  description: string;
};

export async function getSmtpConfig(accessToken: string): Promise<SmtpConfig> {
  const res = await fetch(`${API_URL}/api/smtp`, {
    headers: authHeaders(accessToken),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(await readApiError(res));
  }

  return (await res.json()) as SmtpConfig;
}

export async function generateSmtpPassword(
  accessToken: string,
): Promise<{ password: string; credential: SmtpConfig["credential"] }> {
  const res = await fetch(`${API_URL}/api/smtp/credentials`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw new Error(await readApiError(res));
  }

  return (await res.json()) as { password: string; credential: SmtpConfig["credential"] };
}

export async function revokeSmtpPassword(accessToken: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/smtp/credentials`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
}

export async function updateSmtpSender(
  accessToken: string,
  input: { fromEmail?: string; fromName?: string },
): Promise<SmtpConfig["sender"]> {
  const res = await fetch(`${API_URL}/api/smtp/sender`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(await readApiError(res));
  }

  return (await res.json()) as SmtpConfig["sender"];
}

export type MonitoringStatus = {
  overall: "healthy" | "degraded" | "offline";
  checks: Array<{
    id: string;
    label: string;
    status: "healthy" | "degraded" | "offline" | "optional";
    latencyMs: number | null;
    detail: string;
    checkedAt: string;
  }>;
};

export type MetricsPayload = {
  summary: {
    activeDomains: number;
    pendingDomains: number;
    managedRecords: number;
    totalRecords: number;
    apiRequests7d: number;
    smtpMessages7d: number;
    dnsQueries7d: number;
    avgSyncLatencyMs: number;
  };
  series: {
    dnsQueries: Array<{ label: string; value: number; unit?: string }>;
    apiRequests: Array<{ label: string; value: number; unit?: string }>;
    smtpDelivery: Array<{ label: string; value: number; unit?: string }>;
    syncLatency: Array<{ label: string; value: number; unit?: string }>;
    errorRate: Array<{ label: string; value: number; unit?: string }>;
  };
  generatedAt: string;
};

export type DomainVerification = {
  domain: string;
  state: "pending" | "propagating" | "verified";
  verified: boolean;
  expectedNameservers: string[];
  detectedNameservers: string[];
  matchedNameservers: string[];
  message: string;
  checkedAt: string;
};

export async function getMonitoringStatus(accessToken: string): Promise<MonitoringStatus> {
  const res = await fetch(`${API_URL}/api/monitoring`, {
    headers: authHeaders(accessToken),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(await readApiError(res));
  }

  return (await res.json()) as MonitoringStatus;
}

export async function getMetrics(accessToken: string): Promise<MetricsPayload> {
  const res = await fetch(`${API_URL}/api/metrics`, {
    headers: authHeaders(accessToken),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(await readApiError(res));
  }

  return (await res.json()) as MetricsPayload;
}

export async function verifyDomainDelegation(
  accessToken: string,
  domain: string,
): Promise<DomainVerification> {
  const res = await fetch(`${API_URL}/api/domains/${encodeURIComponent(domain)}/verification`, {
    headers: authHeaders(accessToken),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(await readApiError(res));
  }

  return (await res.json()) as DomainVerification;
}

export type SmtpServer = {
  id: string;
  label: string;
  host: string;
  port: number;
  encryption: "STARTTLS" | "SSL/TLS";
  region: string;
  status: "active" | "maintenance";
  primary: boolean;
};

export async function listSmtpServers(accessToken: string): Promise<SmtpServer[]> {
  const res = await fetch(`${API_URL}/api/smtp/servers`, {
    headers: authHeaders(accessToken),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return (await res.json()) as SmtpServer[];
}

export async function updateSmtpServer(
  accessToken: string,
  id: string,
  input: Partial<Pick<SmtpServer, "label" | "host" | "port" | "encryption" | "region" | "status">>,
): Promise<SmtpServer> {
  const res = await fetch(`${API_URL}/api/smtp/servers/${id}`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return (await res.json()) as SmtpServer;
}

export async function exportDomainZone(
  accessToken: string,
  domain: string,
): Promise<{ domain: string; format: string; content: string }> {
  const res = await fetch(`${API_URL}/api/domains/${encodeURIComponent(domain)}/export`, {
    headers: authHeaders(accessToken),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return (await res.json()) as { domain: string; format: string; content: string };
}

// ---------------------------------------------------------------------------
// Admin console (platform admins only) + notifications + approved locations
// ---------------------------------------------------------------------------

export type AccountStatus = "ACTIVE" | "WARNED" | "SUSPENDED" | "BANNED";

export type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  tenantId: string;
  tenantName: string | null;
  provider: string | null;
  createdAt: string | null;
  isSelf: boolean;
  status: AccountStatus;
  statusReason: string | null;
  suspendedUntil: string | null;
};

export type ModerationEvent = {
  id: string;
  action: string;
  reason: string;
  actorId: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type LoginEvent = {
  id: string;
  userId: string;
  tenantId: string;
  ip: string;
  country: string | null;
  region: string | null;
  city: string | null;
  userAgent: string | null;
  outcome: string;
  createdAt: string;
};

export type ActivityEntry = {
  id: string;
  userId: string | null;
  tenantId: string | null;
  method: string;
  path: string;
  statusCode: number;
  ip: string | null;
  durationMs: number | null;
  createdAt: string;
};

export type ApiKeyAlert = {
  id: string;
  apiKeyId: string;
  tenantId: string;
  ip: string;
  country: string | null;
  path: string | null;
  createdAt: string;
};

export type Page<T> = { items: T[]; nextCursor: string | null };

async function apiGet<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: authHeaders(accessToken), cache: "no-store" });
  if (!res.ok) throw new Error(await readApiError(res));
  return (await res.json()) as T;
}

async function apiPost<T>(accessToken: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return (await res.json()) as T;
}

export function adminListUsers(accessToken: string) {
  return apiGet<AdminUser[]>(accessToken, "/api/admin/users");
}

export function adminModeration(accessToken: string, userId: string) {
  return apiGet<ModerationEvent[]>(accessToken, `/api/admin/users/${userId}/moderation`);
}

export type ModerationAction = "warn" | "suspend" | "ban" | "unsuspend" | "unban";

export function adminModerate(
  accessToken: string,
  userId: string,
  action: ModerationAction,
  input?: { reason?: string; expiresAt?: string },
) {
  return apiPost(accessToken, `/api/admin/users/${userId}/${action}`, input);
}

export function adminLoginEvents(accessToken: string, limit = 100) {
  return apiGet<Page<LoginEvent>>(accessToken, `/api/admin/login-events?limit=${limit}`);
}

export function adminActivity(accessToken: string, limit = 100) {
  return apiGet<Page<ActivityEntry>>(accessToken, `/api/admin/activity?limit=${limit}`);
}

export function adminApiKeyAlerts(accessToken: string, limit = 100) {
  return apiGet<{ items: ApiKeyAlert[] }>(accessToken, `/api/admin/api-key-alerts?limit=${limit}`);
}

export type ApprovedLocation = {
  id: string;
  type: "CIDR" | "COUNTRY";
  value: string;
  label: string | null;
  createdAt: string;
};

export function listApprovedLocations(accessToken: string) {
  return apiGet<ApprovedLocation[]>(accessToken, "/api/tenant/approved-locations");
}

export function createApprovedLocation(
  accessToken: string,
  input: { type: "CIDR" | "COUNTRY"; value: string; label?: string },
) {
  return apiPost<ApprovedLocation>(accessToken, "/api/tenant/approved-locations", input);
}

export async function deleteApprovedLocation(accessToken: string, id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/tenant/approved-locations/${id}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
  if (!res.ok) throw new Error(await readApiError(res));
}

export type AppNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

export function listNotifications(accessToken: string) {
  return apiGet<AppNotification[]>(accessToken, "/api/notifications");
}

export function markNotificationRead(accessToken: string, id: string) {
  return apiPost(accessToken, `/api/notifications/${id}/read`);
}
