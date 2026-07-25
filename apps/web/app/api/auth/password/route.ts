import { loginWithPassword, registerWithPassword } from "@/lib/auth-exchange";

type PasswordRequestBody = {
  mode: "login" | "register";
  email: string;
  password: string;
  name?: string;
};

/** Read the originating browser IP from the incoming edge/proxy headers. */
function clientIpFrom(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim();
  return request.headers.get("x-real-ip") ?? undefined;
}

/** Local email/password login or registration, exchanged for an API token. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as PasswordRequestBody | null;
  if (!body?.email || !body.password || (body.mode !== "login" && body.mode !== "register")) {
    return Response.json({ error: "Enter a valid email and password." }, { status: 400 });
  }

  const clientIp = clientIpFrom(request);

  try {
    const payload =
      body.mode === "register"
        ? await registerWithPassword({ email: body.email, password: body.password, name: body.name, clientIp })
        : await loginWithPassword({ email: body.email, password: body.password, clientIp });

    return Response.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not sign in.";
    return Response.json({ error: message }, { status: 401 });
  }
}
