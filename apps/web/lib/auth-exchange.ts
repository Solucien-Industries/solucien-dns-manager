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

/** Server-side only: exchange a verified identity for an API JWT. */
export async function exchangeIdentityForToken(input: {
  email: string;
  name?: string;
  provider?: string;
  clientIp?: string;
}): Promise<ApiLoginResponse> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Exchange-Secret": getAuthExchangeSecret(),
    },
    body: JSON.stringify(input),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`API login failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }

  return (await res.json()) as ApiLoginResponse;
}
