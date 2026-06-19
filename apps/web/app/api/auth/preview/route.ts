import { exchangeIdentityForToken } from "@/lib/auth-exchange";

/** Dev-only: issue an ephemeral API token for the preview dashboard. */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Not available." }, { status: 404 });
  }

  try {
    const payload = await exchangeIdentityForToken({
      email: "preview@solucien.local",
      name: "Preview User",
      provider: "preview",
    });

    return Response.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Preview token exchange failed.";
    return Response.json({ error: message }, { status: 502 });
  }
}
