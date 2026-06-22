import { oauthConfigured } from "@/auth";

export async function GET() {
  const google = !!(process.env.AUTH_GOOGLE_ID?.trim() && process.env.AUTH_GOOGLE_SECRET?.trim());
  const github = !!(process.env.AUTH_GITHUB_ID?.trim() && process.env.AUTH_GITHUB_SECRET?.trim());

  return Response.json({
    oauthConfigured,
    google,
    github,
    previewAvailable: process.env.NODE_ENV !== "production",
  });
}
