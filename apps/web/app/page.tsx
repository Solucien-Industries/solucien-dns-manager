"use client";

import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  Database,
  ExternalLink,
  Github,
  Globe2,
  KeyRound,
  LockKeyhole,
  Moon,
  Network,
  Server,
  ShieldCheck,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth-provider";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SiteFooter } from "@/components/site-footer";
import { DOCS_URL } from "@/lib/api";
import { isPlatformAdmin } from "@/lib/workspace-users";
import { workflow } from "@/lib/mock-dns";
import { cn } from "@/lib/utils";
import { signIn } from "next-auth/react";

type StatItem = [label: string, value: string | number, icon: LucideIcon];
type ConsoleMode = "admin" | "tenant";

const capabilities = [
  "African ccTLD support without registrar lock-in",
  "PowerDNS authoritative zones with Nani nameservers",
  "Record operations for A, AAAA, CNAME, MX, TXT, and NS",
  "SMTP relay, monitoring, metrics, and OAuth workspace access",
];

export default function Home() {
  const [dark, setDark] = useState(false);
  const [view, setView] = useState<"console" | "home">("console");
  const [consoleMode, setConsoleMode] = useState<ConsoleMode | null>(null);
  const { status, accessToken, user, signOut, error } = useAuth();

  const isAdmin = isPlatformAdmin(user?.role);

  async function handleSignOut() {
    setConsoleMode(null);
    await signOut();
  }

  if (status === "authenticated" && accessToken && isAdmin && consoleMode === null) {
    return (
      <main className={cn(dark && "dark")}>
        <div className="min-h-screen bg-background text-foreground transition-colors">
          <AdminModeChooser userLabel={user?.name ?? user?.email ?? "Admin"} onChoose={setConsoleMode} />
        </div>
      </main>
    );
  }

  return (
    <main className={cn(dark && "dark")}>
      <div className="min-h-screen bg-background text-foreground transition-colors">
        {status === "authenticated" && accessToken ? (
          view === "console" ? (
            <DashboardShell
              accessToken={accessToken}
              user={user}
              onSignOut={handleSignOut}
              dark={dark}
              onThemeChange={() => setDark((value) => !value)}
              onGoHome={() => setView("home")}
              showAdminNav={isAdmin && consoleMode !== "tenant"}
            />
          ) : (
            <Landing
              dark={dark}
              authenticated
              userLabel={user?.name ?? user?.email ?? "Workspace"}
              onEnter={async () => setView("console")}
              authError={error}
              onThemeChange={() => setDark((value) => !value)}
              onSignOut={handleSignOut}
            />
          )
        ) : (
          <Landing
            dark={dark}
            isAuthLoading={status === "loading"}
            authError={error}
            onThemeChange={() => setDark((value) => !value)}
          />
        )}
      </div>
    </main>
  );
}

function AdminModeChooser({
  userLabel,
  onChoose,
}: {
  userLabel: string;
  onChoose: (mode: ConsoleMode) => void;
}) {
  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-md rounded-md border border-border bg-panel p-6 text-center shadow-lg">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-border bg-background">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">Welcome back, {userLabel}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your account has platform administrator access. How would you like to continue?
        </p>
        <div className="mt-6 grid gap-2">
          <Button onClick={() => onChoose("admin")}>
            <ShieldCheck className="h-4 w-4" />
            Continue as Admin
          </Button>
          <Button variant="outline" onClick={() => onChoose("tenant")}>
            <KeyRound className="h-4 w-4" />
            Continue as Tenant
          </Button>
        </div>
      </div>
    </div>
  );
}

function Landing({
  dark,
  authenticated = false,
  isAuthLoading = false,
  userLabel,
  onEnter,
  authError,
  onThemeChange,
  onSignOut,
}: {
  dark: boolean;
  authenticated?: boolean;
  isAuthLoading?: boolean;
  userLabel?: string;
  onEnter?: () => void | Promise<void>;
  authError: string | null;
  onThemeChange: () => void;
  onSignOut?: () => Promise<void>;
}) {
  const [loginMenuOpen, setLoginMenuOpen] = useState(false);

  return (
    <div>
      <Header
        dark={dark}
        authenticated={authenticated}
        onThemeChange={onThemeChange}
        onEnter={onEnter}
        onSignOut={onSignOut}
        loginMenuOpen={loginMenuOpen}
        onLoginMenuOpenChange={setLoginMenuOpen}
        authError={authError}
      />
      {authenticated ? (
        <div className="border-b border-border bg-panel">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <p className="text-sm text-muted-foreground">
              Signed in as <span className="font-semibold text-foreground">{userLabel}</span>. Your session stays active on the home page.
            </p>
            <Button onClick={() => void onEnter?.()}>
              Open console
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : isAuthLoading ? (
        <div className="border-b border-border bg-panel">
          <div className="mx-auto flex max-w-7xl items-center px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:px-6 lg:px-8">
            Verifying security session...
          </div>
        </div>
      ) : null}
      <section className="border-b border-border">
        <div className="mx-auto grid min-h-[calc(100vh-72px)] max-w-7xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-border bg-panel px-3 py-2 text-sm font-semibold text-muted-foreground">
              <ShieldCheck className="h-4 w-4" />
              Third-party verified access. No local passwords.
            </div>
            <h1 className="text-4xl font-semibold leading-tight tracking-normal text-foreground sm:text-5xl lg:text-6xl">
              Nani DNS
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              A professional DNS operations console for African domains and global TLDs, built around Nani nameservers, PowerDNS zones, and trusted OAuth identity.
            </p>
            <div className="mt-8 grid max-w-lg gap-3 sm:grid-cols-2">
              <Button onClick={() => (authenticated ? void onEnter?.() : setLoginMenuOpen(true))}>
                {authenticated ? "Open console" : "Log in"}
                <ArrowRight className="h-4 w-4" />
              </Button>
              <a
                href={DOCS_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-transparent px-4 text-sm font-semibold transition hover:bg-muted"
              >
                <BookOpen className="h-4 w-4" />
                API documentation
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
          <DnsNetworkMap />
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[0.75fr_1.25fr] lg:px-8">
        <div>
          <p className="text-sm font-bold uppercase tracking-normal text-muted-foreground">How it works</p>
          <h2 className="mt-2 text-3xl font-semibold">From domain ownership to managed DNS in one workspace.</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {workflow.map((item, index) => (
            <div key={item} className="rounded-md border border-border bg-panel p-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
                {index + 1}
              </span>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-panel">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-8">
          {capabilities.map((item) => (
            <div key={item} className="flex gap-3">
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <p className="text-sm font-semibold leading-6">{item}</p>
            </div>
          ))}
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}

function Header({
  dark,
  authenticated = false,
  onThemeChange,
  onEnter,
  onSignOut,
  loginMenuOpen,
  onLoginMenuOpenChange,
  authError,
}: {
  dark: boolean;
  authenticated?: boolean;
  onThemeChange: () => void;
  onEnter?: () => void | Promise<void>;
  onSignOut?: () => Promise<void>;
  loginMenuOpen: boolean;
  onLoginMenuOpenChange: (open: boolean) => void;
  authError: string | null;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Network className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold leading-4">Nani</p>
            <p className="text-xs text-muted-foreground">DNS</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition hover:bg-muted sm:inline-flex"
          >
            <BookOpen className="h-4 w-4" />
            API docs
          </a>
          {authenticated ? (
            <>
              <Button variant="outline" className="hidden sm:inline-flex" onClick={() => void onEnter?.()}>
                <LockKeyhole className="h-4 w-4" />
                Console
              </Button>
              {onSignOut ? (
                <Button variant="outline" onClick={() => void onSignOut()}>
                  Sign out
                </Button>
              ) : null}
            </>
          ) : (
            <div className="relative">
              <Button variant="outline" onClick={() => onLoginMenuOpenChange(!loginMenuOpen)}>
                <LockKeyhole className="h-4 w-4" />
                Login/Register
              </Button>
              <LoginMenu open={loginMenuOpen} onClose={() => onLoginMenuOpenChange(false)} authError={authError} />
            </div>
          )}
          <Button variant="ghost" className="h-10 w-10 px-0" onClick={onThemeChange} aria-label="Toggle theme">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </header>
  );
}

function LoginMenu({
  open,
  onClose,
  authError,
}: {
  open: boolean;
  onClose: () => void;
  authError: string | null;
}) {
  const { config, enterPreview, enterWithPassword } = useAuth();
  const [entering, setEntering] = useState(false);
  const [credMode, setCredMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [credError, setCredError] = useState<string | null>(null);

  async function handlePreviewUser() {
    setEntering(true);
    try {
      await enterPreview("user");
      onClose();
    } catch {
      // Error surfaced via authError below; menu stays open so it's visible.
    } finally {
      setEntering(false);
    }
  }

  async function handleCredentialSubmit(event: React.FormEvent) {
    event.preventDefault();
    setCredError(null);
    setEntering(true);
    try {
      await enterWithPassword({
        mode: credMode,
        email,
        password,
        name: credMode === "register" ? name : undefined,
      });
      onClose();
    } catch (err) {
      setCredError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setEntering(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-80 rounded-md border border-border bg-background p-4 shadow-xl">
        <div className="grid gap-3">
          {config?.google ? (
            <button
              onClick={() => signIn("google")}
              className="inline-flex h-11 items-center justify-center gap-3 rounded-md border border-border bg-background px-4 text-sm font-semibold transition hover:bg-muted cursor-pointer"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border text-xs font-bold">G</span>
              Continue with Google
            </button>
          ) : null}

          {config?.github ? (
            <button
              onClick={() => signIn("github")}
              className="inline-flex h-11 items-center justify-center gap-3 rounded-md border border-border bg-background px-4 text-sm font-semibold transition hover:bg-muted cursor-pointer"
            >
              <Github className="h-5 w-5" />
              Continue with GitHub
            </button>
          ) : null}

          <form onSubmit={(event) => void handleCredentialSubmit(event)} className="grid gap-2 border-t border-border pt-3">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setCredMode("login")}
                className={cn(
                  "flex-1 rounded px-2 py-1 text-xs font-bold uppercase tracking-normal transition",
                  credMode === "login" ? "bg-panel text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => setCredMode("register")}
                className={cn(
                  "flex-1 rounded px-2 py-1 text-xs font-bold uppercase tracking-normal transition",
                  credMode === "register" ? "bg-panel text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Register
              </button>
            </div>
            {credMode === "register" ? (
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name (optional)" />
            ) : null}
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              required
            />
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              minLength={8}
              required
            />
            <Button type="submit" variant="outline" disabled={entering}>
              {entering ? "Working..." : credMode === "register" ? "Create account" : "Log in with password"}
            </Button>
            {credError ? <p className="text-xs text-red-600">{credError}</p> : null}
          </form>

          {config?.previewAvailable ? (
            <div className="grid gap-2 border-t border-border pt-3">
              <p className="text-xs font-bold uppercase tracking-normal text-muted-foreground">Dev preview</p>
              <Button variant="outline" onClick={() => void handlePreviewUser()} disabled={entering}>
                <KeyRound className="h-4 w-4" />
                {entering ? "Starting..." : "Preview as User"}
              </Button>
            </div>
          ) : null}
        </div>
        {authError ? (
          <p className="mt-3 text-xs leading-5 text-red-600">{authError}</p>
        ) : (
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Google and GitHub handle credential verification for you, or use an email and password.
          </p>
        )}
      </div>
    </>
  );
}

function DnsNetworkMap() {
  const steps = [
    ["Domain", "example.com"],
    ["Nameservers", "ns1.nani.dns"],
    ["PowerDNS Zone", "example.com."],
    ["Records", "A, MX, TXT"],
  ];

  return (
    <div className="rounded-md border border-border bg-panel p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-muted-foreground">DNS infrastructure visual</p>
          <h2 className="text-2xl font-semibold">Domain to records, clearly routed.</h2>
        </div>
        <div className="rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold">99.99%</div>
      </div>
      <div className="grid gap-3">
        {steps.map(([label, value], index) => (
          <div key={label} className="grid items-center gap-3 sm:grid-cols-[1fr_44px_1fr]">
            <div className="rounded-md border border-border bg-background p-4">
              <p className="text-xs font-bold uppercase tracking-normal text-muted-foreground">{label}</p>
              <p className="mt-2 font-semibold">{value}</p>
            </div>
            <div className="hidden h-px bg-border sm:block" />
            <div className="rounded-md border border-border bg-background p-4">
              <p className="text-xs font-bold uppercase tracking-normal text-muted-foreground">Control plane</p>
              <p className="mt-2 font-semibold">{index === 0 ? "Tenant verified" : index === 1 ? "Nani routing" : index === 2 ? "API synchronized" : "Ready to publish"}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-3 border-t border-border pt-5 sm:grid-cols-3">
        {([
          ["Domains", "4", Globe2],
          ["Records", "58", Database],
          ["Nameservers", "2", Server],
        ] satisfies StatItem[]).map(([label, value, Icon]) => (
          <div key={label} className="rounded-md border border-border bg-background p-4">
            <Icon className="h-5 w-5 text-muted-foreground" />
            <p className="mt-5 text-2xl font-semibold">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
