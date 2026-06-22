"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { signOut as nextAuthSignOut, useSession } from "next-auth/react";

type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  tenantId: string;
};

type AuthConfig = {
  oauthConfigured: boolean;
  google: boolean;
  github: boolean;
  previewAvailable: boolean;
};

type AuthContextValue = {
  status: "loading" | "authenticated" | "unauthenticated";
  accessToken: string | null;
  user: AuthUser | null;
  config: AuthConfig | null;
  error: string | null;
  enterPreview: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function readJson<T>(res: Response): Promise<T> {
  const payload = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(payload.error ?? `Request failed (${res.status}).`);
  }
  return payload;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, status: sessionStatus } = useSession();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [exchangeStatus, setExchangeStatus] = useState<"idle" | "loading" | "done">("idle");

  useEffect(() => {
    fetch("/api/auth/config")
      .then((res) => readJson<AuthConfig>(res))
      .then(setConfig)
      .catch(() => {
        setConfig({
          oauthConfigured: false,
          google: false,
          github: false,
          previewAvailable: process.env.NODE_ENV !== "production",
        });
      });
  }, []);

  useEffect(() => {
    if (previewMode) return;

    if (sessionStatus !== "authenticated" || !session?.user?.email) {
      setAccessToken(null);
      setUser(null);
      setExchangeStatus("idle");
      return;
    }

    let cancelled = false;
    setExchangeStatus("loading");
    setError(null);

    fetch("/api/auth/token", { method: "POST" })
      .then((res) => readJson<{ accessToken: string; user: AuthUser }>(res))
      .then((payload) => {
        if (cancelled) return;
        setAccessToken(payload.accessToken);
        setUser(payload.user);
        setExchangeStatus("done");
      })
      .catch((exchangeError) => {
        if (cancelled) return;
        setAccessToken(null);
        setUser(null);
        setExchangeStatus("done");
        setError(exchangeError instanceof Error ? exchangeError.message : "Token exchange failed.");
      });

    return () => {
      cancelled = true;
    };
  }, [previewMode, session?.user?.email, sessionStatus]);

  const enterPreview = useCallback(async () => {
    setError(null);
    setPreviewMode(true);

    try {
      const payload = await readJson<{ accessToken: string; user: AuthUser }>(
        await fetch("/api/auth/preview", { method: "POST" }),
      );

      setAccessToken(payload.accessToken);
      setUser(payload.user);
      setExchangeStatus("done");
    } catch (previewError) {
      setPreviewMode(false);
      setAccessToken(null);
      setUser(null);
      setExchangeStatus("idle");
      const message = previewError instanceof Error ? previewError.message : "Preview token exchange failed.";
      setError(message);
      throw previewError;
    }
  }, []);

  const signOut = useCallback(async () => {
    setPreviewMode(false);
    setAccessToken(null);
    setUser(null);
    setError(null);
    setExchangeStatus("idle");

    if (session) {
      await nextAuthSignOut();
    }
  }, [session]);

  const status: AuthContextValue["status"] = useMemo(() => {
    if (sessionStatus === "loading" || exchangeStatus === "loading") return "loading";
    if (accessToken) return "authenticated";
    return "unauthenticated";
  }, [accessToken, exchangeStatus, sessionStatus]);

  const value = useMemo(
    () => ({
      status,
      accessToken,
      user,
      config,
      error,
      enterPreview,
      signOut,
    }),
    [accessToken, config, enterPreview, error, signOut, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
}
