import { auth } from "@/auth";
import { exchangeIdentityForToken } from "@/lib/auth-exchange";

/** Exchange the current Auth.js session for an API bearer token. */
export async function POST() {
  const session = await auth();

  if (!session?.user?.email) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const payload = await exchangeIdentityForToken({
      email: session.user.email,
      name: session.user.name ?? undefined,
    });

    return Response.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Token exchange failed.";
    return Response.json({ error: message }, { status: 502 });
  }
}
