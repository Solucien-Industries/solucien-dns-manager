const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function getAuthExchangeSecret(): string {
  return process.env.AUTH_EXCHANGE_SECRET ?? "dev-exchange-secret-local-only";
}

export type ApiLoginResponse = {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    tenantId: string;
  };
};

type CandidateEndpoint = {
  baseUrl: string;
  label: string;
};

function exchangeEndpoints(): CandidateEndpoint[] {
  const primary = API_URL.replace(/\/$/, "");
  const endpoints: CandidateEndpoint[] = [{ baseUrl: primary, label: "configured API URL" }];

  // In local dev, Node fetch may resolve localhost to ::1 while the API binds IPv4.
  // Try loopback aliases before failing the preview/token exchange route.
  if (primary.startsWith("http://localhost:")) {
    endpoints.push({
      baseUrl: primary.replace("http://localhost:", "http://127.0.0.1:"),
      label: "IPv4 loopback fallback",
    });
  } else if (primary.startsWith("http://127.0.0.1:")) {
    endpoints.push({
      baseUrl: primary.replace("http://127.0.0.1:", "http://localhost:"),
      label: "localhost fallback",
    });
  }

  return endpoints;
}

/** Server-side only: exchange a verified identity for an API JWT. */
export async function exchangeIdentityForToken(input: {
  email: string;
  name?: string;
  provider?: string;
  clientIp?: string;
}): Promise<ApiLoginResponse> {
  let lastError: string | null = null;

  for (const endpoint of exchangeEndpoints()) {
    try {
      const res = await fetch(`${endpoint.baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Auth-Exchange-Secret": getAuthExchangeSecret(),
        },
        body: JSON.stringify(input),
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        lastError = `API login failed via ${endpoint.label} (${res.status})${detail ? `: ${detail}` : ""}`;
        continue;
      }

      return (await res.json()) as ApiLoginResponse;
    } catch (error) {
      lastError =
        error instanceof Error
          ? `API login failed via ${endpoint.label}: ${error.message}`
          : `API login failed via ${endpoint.label}.`;
    }
  }

  throw new Error(lastError ?? "API login failed.");
}
