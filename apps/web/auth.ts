import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

const googleClientId = process.env.AUTH_GOOGLE_ID?.trim();
const googleClientSecret = process.env.AUTH_GOOGLE_SECRET?.trim();
const githubClientId = process.env.AUTH_GITHUB_ID?.trim();
const githubClientSecret = process.env.AUTH_GITHUB_SECRET?.trim();

const oauthProviders = [
  ...(googleClientId && googleClientSecret
    ? [
        Google({
          clientId: googleClientId,
          clientSecret: googleClientSecret,
        }),
      ]
    : []),
  ...(githubClientId && githubClientSecret
    ? [
        GitHub({
          clientId: githubClientId,
          clientSecret: githubClientSecret,
        }),
      ]
    : []),
];

/** True when at least one OAuth provider is configured in apps/web/.env.local. */
export const oauthConfigured = oauthProviders.length > 0;

const secret =
  process.env.AUTH_SECRET ??
  process.env.NEXTAUTH_SECRET ??
  (process.env.NODE_ENV === "production" ? undefined : "dev-insecure-auth-secret-local-only");

if (!secret && process.env.NODE_ENV === "production") {
  throw new Error(
    "Missing session secret. Set AUTH_SECRET or NEXTAUTH_SECRET in apps/web/.env.local.",
  );
}

// NextAuth requires at least one provider. In local dev without OAuth creds, register
// a placeholder so the app boots; preview access uses /api/auth/preview instead.
const providers =
  oauthProviders.length > 0
    ? oauthProviders
    : [
        Credentials({
          id: "placeholder",
          name: "Placeholder",
          credentials: {},
          authorize: () => null,
        }),
      ];

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  secret,
  trustHost: true,
  debug: process.env.NODE_ENV !== "production",
});
