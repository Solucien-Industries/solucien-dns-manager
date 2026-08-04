import { exchangeIdentityForToken } from "@/lib/auth-exchange";

type PreviewRole = "admin" | "user" | "owner";

/** Built-in dev identities — each maps to a deterministic backend role. */
const PREVIEW_IDENTITIES: Record<PreviewRole, { email: string; name: string }> = {
  admin: { email: "admin@solucien.local", name: "Solucien Admin" },
  user: { email: "user@solucien.local", name: "Solucien User" },
  owner: { email: "preview@solucien.local", name: "Preview User" },
};

function resolveRole(value: string | null): PreviewRole {
  if (value === "admin" || value === "user" || value === "owner") return value;
  return "owner";
}

/** Dev-only: issue an ephemeral API token for the preview dashboard. */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Not available." }, { status: 404 });
  }

  const role = resolveRole(new URL(request.url).searchParams.get("role"));
  const identity = PREVIEW_IDENTITIES[role];

  try {
    const payload = await exchangeIdentityForToken({
      email: identity.email,
      name: identity.name,
      provider: "preview",
    });

    return Response.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Preview token exchange failed.";
    return Response.json({ error: message }, { status: 502 });
  }
}
