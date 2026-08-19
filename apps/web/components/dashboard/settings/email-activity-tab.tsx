"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Inbox, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { listMessages, type EmailMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<Lowercase<EmailMessage["status"]>, string> = {
  queued: "border-sky-600/40 text-sky-600", sent: "border-sky-600/40 text-sky-600",
  delivered: "border-emerald-600/40 text-emerald-600", deferred: "border-amber-600/40 text-amber-600",
  bounced: "border-red-600/40 text-red-600", complained: "border-red-600/40 text-red-600",
  failed: "border-red-600/40 text-red-600",
};

export function EmailActivityTab({ accessToken }: { accessToken: string }) {
  const [rows, setRows] = useState<EmailMessage[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listMessages(accessToken)
      .then((result) => { if (active) setRows(result.items); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Failed to load email activity."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken]);

  const messages = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter((message) => !term || message.headerFrom.toLowerCase().includes(term) || message.recipients.some((recipient) => recipient.includes(term)) || message.subject.toLowerCase().includes(term));
  }, [query, rows]);

  return (
    <div className="grid gap-5">
      <div><h3 className="font-semibold">Email activity</h3><p className="mt-1 text-sm text-muted-foreground">Transactional messages submitted through the Nani delivery service.</p></div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-fit items-center gap-2 rounded-md border border-foreground bg-background px-3 py-2 text-sm font-semibold"><ArrowUpRight className="h-4 w-4" />Sent<span className="rounded-full bg-panel px-2 text-xs text-muted-foreground">{rows.length}</span></div>
        <div className="relative sm:w-64"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sent email" className="pl-9" /></div>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Loading email activity...</p> : null}
      {error ? <p className="rounded-md border border-red-600/40 p-3 text-sm text-red-600">{error}</p> : null}
      <section className="overflow-x-auto rounded-md border border-border bg-background">
        <table className="min-w-full text-left text-sm"><thead className="border-b border-border text-xs font-bold uppercase text-muted-foreground"><tr><th className="px-4 py-3">Sender</th><th className="px-4 py-3">Recipient</th><th className="px-4 py-3">Subject</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Time</th></tr></thead>
          <tbody>{messages.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{loading ? "Loading messages..." : "No sent email matches your search."}</td></tr> : messages.map((message) => { const status = message.status.toLowerCase() as Lowercase<EmailMessage["status"]>; return <tr key={message.id} className="border-b border-border last:border-b-0"><td className="px-4 py-3 font-medium">{message.headerFrom}</td><td className="px-4 py-3">{message.recipients.join(", ")}</td><td className="px-4 py-3 text-muted-foreground">{message.subject}</td><td className="px-4 py-3"><span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize", STATUS_STYLES[status])}>{status}</span></td><td className="px-4 py-3 text-muted-foreground">{new Date(message.createdAt).toLocaleString()}</td></tr>; })}</tbody>
        </table>
      </section>
      {messages.length > 0 ? <p className="inline-flex items-center gap-2 text-xs text-muted-foreground"><Inbox className="h-3.5 w-3.5" />{messages.length} sent {messages.length === 1 ? "message" : "messages"}</p> : null}
    </div>
  );
}
