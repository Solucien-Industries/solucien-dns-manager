import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

const googleClientId = process.env.AUTH_GOOGLE_ID?.trim();
const googleClientSecret = process.env.AUTH_GOOGLE_SECRET?.trim();
const githubClientId = process.env.AUTH_GITHUB_ID?.trim();
const githubClientSecret = process.env.AUTH_GITHUB_SECRET?.trim();

const providers = [
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

const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

if (providers.length === 0) {
  throw new Error(
    "No OAuth providers configured. Set AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET or AUTH_GITHUB_ID/AUTH_GITHUB_SECRET in apps/web/.env.local.",
  );
}

if (!secret) {
  throw new Error(
    "Missing session secret. Set AUTH_SECRET or NEXTAUTH_SECRET in apps/web/.env.local.",
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  secret,
  trustHost: true,
  debug: process.env.NODE_ENV !== "production",
});
