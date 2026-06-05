"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Check,
  CircleAlert,
  Database,
  Fingerprint,
  Github,
  Globe2,
  KeyRound,
  Layers,
  LockKeyhole,
  Moon,
  Network,
  Plus,
  Search,
  Server,
  ShieldCheck,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDashboardData } from "@/lib/api";
import { DnsRecord, RecordType, workflow } from "@/lib/mock-dns";
import { cn } from "@/lib/utils";

const recordTypes: RecordType[] = ["A", "AAAA", "CNAME", "MX", "TXT", "NS"];
type StatItem = [label: string, value: string | number, icon: LucideIcon];
type NavItem = [label: string, icon: LucideIcon];

const capabilities = [
  "African ccTLD support without registrar lock-in",
  "PowerDNS authoritative zones with ns1/ns2 assignment",
  "Record operations for A, AAAA, CNAME, MX, TXT, and NS",
  "Workspace access through external identity providers",
];

export default function Home() {
  const [dark, setDark] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);

  return (
    <main className={cn(dark && "dark")}>
      <div className="min-h-screen bg-background text-foreground transition-colors">
        {isAuthed ? (
          <Dashboard onSignOut={() => setIsAuthed(false)} dark={dark} onThemeChange={() => setDark((value) => !value)} />
        ) : (
          <Landing dark={dark} onEnter={() => setIsAuthed(true)} onThemeChange={() => setDark((value) => !value)} />
        )}
      </div>
    </main>
  );
}

function Landing({ dark, onEnter, onThemeChange }: { dark: boolean; onEnter: () => void; onThemeChange: () => void }) {
  return (
    <div>
      <Header dark={dark} onThemeChange={onThemeChange} onEnter={onEnter} />
      <section className="border-b border-border">
        <div className="mx-auto grid min-h-[calc(100vh-72px)] max-w-7xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-border bg-panel px-3 py-2 text-sm font-semibold text-muted-foreground">
              <ShieldCheck className="h-4 w-4" />
              Third-party verified access. No local passwords.
            </div>
            <h1 className="text-4xl font-semibold leading-tight tracking-normal text-foreground sm:text-5xl lg:text-6xl">
              Solucien DNS Manager
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              A professional DNS operations console for African domains and global TLDs, built around Solucien nameservers, PowerDNS zones, and trusted OAuth identity.
            </p>
            <div className="mt-8 grid max-w-lg gap-3 sm:grid-cols-2">
              <Button onClick={onEnter}>
                Preview dashboard
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={() => document.getElementById("access")?.scrollIntoView({ behavior: "smooth" })}>
                Sign in options
              </Button>
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

      <section id="access" className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_420px] lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-normal text-muted-foreground">Secure workspace access</p>
          <h2 className="mt-2 text-3xl font-semibold">Sign in with a trusted identity provider.</h2>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Solucien DNS Manager treats users as externally verified identities. Google and GitHub handle credential verification; the app receives an authenticated user profile for tenant access.
          </p>
        </div>
        <AuthPanel onEnter={onEnter} />
      </section>
    </div>
  );
}

function Header({ dark, onThemeChange, onEnter }: { dark: boolean; onThemeChange: () => void; onEnter: () => void }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Network className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold leading-4">Solucien</p>
            <p className="text-xs text-muted-foreground">DNS Manager</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="h-10 w-10 px-0" onClick={onThemeChange} aria-label="Toggle theme">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button variant="outline" className="hidden sm:inline-flex" onClick={onEnter}>
            <LockKeyhole className="h-4 w-4" />
            Console
          </Button>
        </div>
      </div>
    </header>
  );
}

function AuthPanel({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="rounded-md border border-border bg-background p-5">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-panel">
          <Fingerprint className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-semibold">Identity verification</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Choose a third-party provider. Solucien does not ask for or store your password.</p>
        </div>
      </div>
      <div className="grid gap-3">
        <a
          href="/api/auth/signin/google"
          className="inline-flex h-11 items-center justify-center gap-3 rounded-md border border-border bg-background px-4 text-sm font-semibold transition hover:bg-muted"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border text-xs font-bold">G</span>
          Continue with Google
        </a>
        <a
          href="/api/auth/signin/github"
          className="inline-flex h-11 items-center justify-center gap-3 rounded-md border border-border bg-background px-4 text-sm font-semibold transition hover:bg-muted"
        >
          <Github className="h-5 w-5" />
          Continue with GitHub
        </a>
        <Button variant="primary" onClick={onEnter}>
          <KeyRound className="h-4 w-4" />
          Preview authenticated dashboard
        </Button>
      </div>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        OAuth redirects require provider credentials in the local environment. The preview button keeps the frontend testable while those secrets are absent.
      </p>
    </div>
  );
}

function DnsNetworkMap() {
  const steps = [
    ["Domain", "solucien.cd"],
    ["Nameservers", "ns1 / ns2"],
    ["PowerDNS Zone", "solucien.cd."],
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
              <p className="mt-2 font-semibold">{index === 0 ? "Tenant verified" : index === 1 ? "Solucien routing" : index === 2 ? "API synchronized" : "Ready to publish"}</p>
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

function Dashboard({
  dark,
  onThemeChange,
  onSignOut,
}: {
  dark: boolean;
  onThemeChange: () => void;
  onSignOut: () => void;
}) {
  const [recordFilter, setRecordFilter] = useState<RecordType | "All">("All");
  const [query, setQuery] = useState("");
  const [selectedDomain, setSelectedDomain] = useState("solucien.cd");
  const [data, setData] = useState<Awaited<ReturnType<typeof getDashboardData>> | null>(null);

  useEffect(() => {
    let mounted = true;

    getDashboardData().then((dashboardData) => {
      if (mounted) {
        setData(dashboardData);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  const records = useMemo(() => {
    const source = data?.records ?? [];
    return source.filter((record) => {
      const matchesType = recordFilter === "All" || record.type === recordFilter;
      const matchesSearch = `${record.domain} ${record.name} ${record.value}`.toLowerCase().includes(query.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [data?.records, query, recordFilter]);

  const selectedDomainData = data?.domains.find((domain) => domain.name === selectedDomain);

  if (!data) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="rounded-md border border-border bg-panel p-6 text-sm font-semibold">Loading Solucien DNS Manager...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Network className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold leading-5">Solucien DNS Manager</p>
              <p className="text-xs text-muted-foreground">Tenant: Solucien Industries</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="h-10 w-10 px-0" onClick={onThemeChange} aria-label="Toggle theme">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="outline" onClick={onSignOut}>Sign out</Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[208px_1fr] lg:px-8">
        <aside className="rounded-md border border-border bg-panel p-2 lg:min-h-[calc(100vh-112px)]">
          {([
            ["Overview", Activity],
            ["Domains", Globe2],
            ["DNS Records", Database],
            ["Nameservers", Server],
            ["Monitoring", ShieldCheck],
          ] satisfies NavItem[]).map(([label, Icon], index) => (
            <button
              key={label}
              className={cn(
                "mb-1 flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-semibold text-muted-foreground transition hover:bg-background hover:text-foreground",
                index === 0 && "bg-background text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </aside>

        <section className="grid gap-5">
          <div className="rounded-md border border-border bg-panel p-5">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <p className="text-sm font-semibold text-muted-foreground">PowerDNS authoritative dashboard</p>
                <h1 className="mt-1 text-3xl font-semibold">Zones, records, and nameserver health.</h1>
              </div>
              <Button>
                <Plus className="h-4 w-4" />
                Add domain
              </Button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {([
                ["Active domains", data.stats.activeDomains, Globe2],
                ["DNS records", data.stats.managedRecords, Database],
                ["Nameservers", data.stats.nameservers, Server],
                ["Review queue", data.stats.attentionItems, CircleAlert],
              ] satisfies StatItem[]).map(([label, value, Icon]) => (
                <div key={label} className="rounded-md border border-border bg-background p-4">
                  <div className="mb-5 flex items-center justify-between">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <span className="rounded border border-border px-2 py-1 text-xs font-bold text-muted-foreground">SDM</span>
                  </div>
                  <p className="text-3xl font-semibold">{value}</p>
                  <p className="text-sm text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
            <DomainWorkspace domains={data.domains} selectedDomain={selectedDomain} onSelectedDomain={setSelectedDomain} />
            <div className="grid gap-5">
              <ZoneSummary selectedDomainData={selectedDomainData} />
              <RecordsPanel records={records} query={query} recordFilter={recordFilter} onQuery={setQuery} onRecordFilter={setRecordFilter} />
            </div>
          </div>

          <ZoneEditor selectedDomain={selectedDomain} />
        </section>
      </div>
    </div>
  );
}

function DomainWorkspace({
  domains,
  selectedDomain,
  onSelectedDomain,
}: {
  domains: Awaited<ReturnType<typeof getDashboardData>>["domains"];
  selectedDomain: string;
  onSelectedDomain: (domain: string) => void;
}) {
  return (
    <div className="rounded-md border border-border bg-panel p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Domains</h2>
        <span className="text-xs font-semibold text-muted-foreground">users {"->"} domains {"->"} zones</span>
      </div>
      <div className="grid gap-2">
        {domains.map((domain) => (
          <button
            key={domain.id}
            onClick={() => onSelectedDomain(domain.name)}
            className={cn(
              "rounded-md border border-border bg-background p-3 text-left transition hover:border-foreground",
              selectedDomain === domain.name && "border-foreground",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{domain.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{domain.owner}</p>
              </div>
              <StatusBadge status={domain.status} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <Meta label="Records" value={String(domain.records)} />
              <Meta label="Sync" value={domain.lastSync} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ZoneSummary({ selectedDomainData }: { selectedDomainData: Awaited<ReturnType<typeof getDashboardData>>["domains"][number] | undefined }) {
  return (
    <div className="rounded-md border border-border bg-panel p-4">
      <div className="mb-4 flex items-center gap-2">
        <Layers className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Zone workspace</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Meta label="Domain" value={selectedDomainData?.name ?? "Unknown"} />
        <Meta label="TLD" value={selectedDomainData?.tld ?? "-"} />
        <Meta label="Zone" value={selectedDomainData?.zone ?? "-"} />
        <Meta label="Uptime" value={selectedDomainData?.uptime ?? "-"} />
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {selectedDomainData?.nameservers.map((nameserver) => (
          <div key={nameserver} className="rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold">
            {nameserver}
          </div>
        ))}
      </div>
    </div>
  );
}

function RecordsPanel({
  records,
  query,
  recordFilter,
  onQuery,
  onRecordFilter,
}: {
  records: DnsRecord[];
  query: string;
  recordFilter: RecordType | "All";
  onQuery: (value: string) => void;
  onRecordFilter: (value: RecordType | "All") => void;
}) {
  return (
    <div className="rounded-md border border-border bg-panel p-4">
      <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h2 className="text-lg font-semibold">DNS records</h2>
          <p className="text-sm text-muted-foreground">Filter records, inspect TTLs, and stage API changes.</p>
        </div>
        <div className="relative w-full md:w-64">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search records" />
        </div>
      </div>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {["All", ...recordTypes].map((type) => (
          <button
            key={type}
            onClick={() => onRecordFilter(type as RecordType | "All")}
            className={cn(
              "h-9 rounded-md border border-border px-3 text-sm font-semibold transition",
              recordFilter === type ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {type}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-md border border-border">
        <div className="grid grid-cols-[76px_1fr_1.2fr_80px] bg-muted px-3 py-2 text-xs font-bold uppercase tracking-normal text-muted-foreground">
          <span>Type</span>
          <span>Name</span>
          <span>Value</span>
          <span>TTL</span>
        </div>
        {records.map((record) => (
          <div key={record.id} className="grid grid-cols-[76px_1fr_1.2fr_80px] gap-2 border-t border-border bg-background px-3 py-3 text-sm">
            <span className="font-bold">{record.type}</span>
            <span className="min-w-0 truncate">{record.name}.{record.domain}</span>
            <span className="min-w-0 truncate text-muted-foreground">{record.value}</span>
            <span>{record.ttl}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ZoneEditor({ selectedDomain }: { selectedDomain: string }) {
  return (
    <div className="rounded-md border border-border bg-panel p-4">
      <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h2 className="text-lg font-semibold">Stage a record for {selectedDomain}</h2>
          <p className="text-sm text-muted-foreground">Fields match the schema: type, name, value, TTL, and optional priority.</p>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold">
          <Check className="h-4 w-4" />
          PowerDNS API ready
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-[120px_1fr_1.4fr_110px_110px_auto]">
        <select className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none">
          {recordTypes.map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
        <Input placeholder="name" defaultValue="www" />
        <Input placeholder="value" defaultValue={selectedDomain} />
        <Input placeholder="ttl" defaultValue="300" />
        <Input placeholder="priority" />
        <Button>
          <Plus className="h-4 w-4" />
          Stage
        </Button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded border border-border px-2 py-1 text-xs font-bold text-muted-foreground">
      {status}
    </span>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-semibold">{value}</p>
    </div>
  );
}
