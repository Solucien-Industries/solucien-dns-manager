"use client";

import { useEffect, useMemo, useState } from "react";
import { Globe2, Plus, Search, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DashboardData } from "@/lib/api";
import { RecordType } from "@/lib/mock-dns";
import { cn } from "@/lib/utils";

const recordTypes: (RecordType | "All")[] = ["All", "A", "AAAA", "CNAME", "MX", "TXT", "NS"];

const DNS_TEMPLATES = [
  { label: "SPF", type: "TXT" as const, name: "@", value: "v=spf1 include:nani.dns -all" },
  { label: "DMARC", type: "TXT" as const, name: "_dmarc", value: "v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com" },
  { label: "DKIM placeholder", type: "TXT" as const, name: "default._domainkey", value: "v=DKIM1; k=rsa; p=..." },
  { label: "WWW CNAME", type: "CNAME" as const, name: "www", value: "yourdomain.com" },
];

type RecordsSectionProps = {
  accessToken?: string;
  data: DashboardData;
  onAddDomain?: () => void;
};

export function RecordsSection({ data, onAddDomain }: RecordsSectionProps) {
  const [selectedDomain, setSelectedDomain] = useState("");
  const [recordFilter, setRecordFilter] = useState<RecordType | "All">("All");
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState({ type: "A" as RecordType, name: "@", value: "", ttl: "300" });
  const [localRecords, setLocalRecords] = useState(data.records);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setLocalRecords(data.records);
  }, [data.records]);

  useEffect(() => {
    setSelectedDomain((current) => {
      if (data.domains.length === 0) return "";
      if (current && data.domains.some((domain) => domain.name === current)) return current;
      return data.domains[0].name;
    });
  }, [data.domains]);

  const selectedZone = data.domains.find((domain) => domain.name === selectedDomain);

  const records = useMemo(() => {
    if (!selectedDomain) return [];

    return localRecords.filter((record) => {
      const matchesDomain = record.domain === selectedDomain;
      const matchesType = recordFilter === "All" || record.type === recordFilter;
      const matchesSearch = `${record.name} ${record.value}`.toLowerCase().includes(query.toLowerCase());
      return matchesDomain && matchesType && matchesSearch;
    });
  }, [localRecords, query, recordFilter, selectedDomain]);

  function applyTemplate(template: (typeof DNS_TEMPLATES)[number]) {
    setDraft({
      type: template.type,
      name: template.name,
      value: template.value.replace("yourdomain.com", selectedDomain || "yourdomain.com"),
      ttl: "3600",
    });
    setAddOpen(true);
    setNotice(`Loaded ${template.label} template.`);
  }

  function handleAddRecord(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedDomain) return;
    setLocalRecords((current) => [
      {
        id: `rec_${Math.random().toString(36).slice(2, 8)}`,
        domain: selectedDomain,
        type: draft.type,
        name: draft.name,
        value: draft.value,
        ttl: Number(draft.ttl) || 300,
        updatedAt: "Just now",
      },
      ...current,
    ]);
    setAddOpen(false);
    setDraft({ type: "A", name: "@", value: "", ttl: "300" });
    setNotice("Record added locally. API persistence will follow in a later release.");
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-semibold text-muted-foreground">DNS records</p>
          <h1 className="mt-1 text-3xl font-semibold">Manage records for a zone</h1>
        </div>
        {selectedDomain ? (
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add record
          </Button>
        ) : null}
      </div>

      {notice ? <p className="rounded-md border border-border bg-panel px-4 py-3 text-sm text-muted-foreground">{notice}</p> : null}

      {data.domains.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-panel p-10 text-center">
          <Globe2 className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-4 font-semibold">Add a domain first</p>
          {onAddDomain ? <Button className="mt-5" onClick={onAddDomain}>Add domain</Button> : null}
        </div>
      ) : (
        <>
          <div className="rounded-md border border-border bg-panel p-4">
            <label className="grid gap-2 text-sm font-semibold" htmlFor="records-domain">
              Domain
              <select
                id="records-domain"
                value={selectedDomain}
                onChange={(event) => setSelectedDomain(event.target.value)}
                className="h-10 w-full max-w-md rounded-md border border-border bg-background px-3 text-sm"
              >
                {data.domains.map((domain) => (
                  <option key={domain.id} value={domain.name}>{domain.name}</option>
                ))}
              </select>
            </label>
            {selectedZone ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {selectedZone.status} · {records.length} visible records · Sync: {selectedZone.lastSync}
              </p>
            ) : null}
          </div>

          <section className="rounded-md border border-border bg-panel p-4">
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Quick templates</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {DNS_TEMPLATES.map((template) => (
                <Button key={template.label} type="button" variant="outline" className="h-9" onClick={() => applyTemplate(template)}>
                  {template.label}
                </Button>
              ))}
            </div>
          </section>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${selectedDomain}...`} className="pl-9" />
            </div>
            <div className="flex flex-wrap gap-2">
              {recordTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setRecordFilter(type)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs font-semibold transition",
                    recordFilter === type ? "border-foreground bg-foreground text-background" : "border-border bg-background text-muted-foreground",
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-border bg-panel">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border text-xs font-bold uppercase tracking-normal text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Value</th>
                  <th className="px-4 py-3">TTL</th>
                  <th className="px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 font-semibold">{record.type}</td>
                    <td className="px-4 py-3">{record.name}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-muted-foreground">{record.value}</td>
                    <td className="px-4 py-3">{record.ttl}</td>
                    <td className="px-4 py-3 text-muted-foreground">{record.updatedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {records.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">No records match your filters.</p>
            ) : null}
          </div>
        </>
      )}

      {addOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form onSubmit={handleAddRecord} className="w-full max-w-lg rounded-md border border-border bg-background p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Add DNS record</h2>
            <p className="mt-1 text-sm text-muted-foreground">Zone: {selectedDomain}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold">
                Type
                <select value={draft.type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as RecordType }))} className="h-10 rounded-md border border-border bg-background px-3 text-sm">
                  {recordTypes.filter((t) => t !== "All").map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Name
                <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
                Value
                <Input value={draft.value} onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))} required />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                TTL
                <Input value={draft.ttl} onChange={(e) => setDraft((d) => ({ ...d, ttl: e.target.value }))} />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit">Add record</Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
