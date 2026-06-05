import { dnsRecords, domains } from "@/lib/mock-dns";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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

/**
 * Fetches the dashboard payload from the NestJS API (GET /api/dashboard).
 * Falls back to local mock data so the console still renders when the backend
 * (or PowerDNS/Postgres) isn't running yet.
 */
export async function getDashboardData() {
  try {
    const res = await fetch(`${API_URL}/api/dashboard`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return (await res.json()) as ReturnType<typeof mockDashboard>;
  } catch {
    return mockDashboard();
  }
}
