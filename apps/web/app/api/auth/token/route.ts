import { auth } from "@/auth";
import { exchangeIdentityForToken } from "@/lib/auth-exchange";

/** Read the originating browser IP from the incoming edge/proxy headers. */
function clientIpFrom(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim();
  return request.headers.get("x-real-ip") ?? undefined;
}

/** Exchange the current Auth.js session for an API bearer token. */
export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.email) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const payload = await exchangeIdentityForToken({
      email: session.user.email,
      name: session.user.name ?? undefined,
      clientIp: clientIpFrom(request),
    });

    return Response.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Token exchange failed.";
    return Response.json({ error: message }, { status: 502 });
  }
}
