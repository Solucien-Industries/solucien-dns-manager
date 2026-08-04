"use client";

import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Inbox, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Direction = "sent" | "received";

type EmailMessage = {
  id: string;
  direction: Direction;
  /** Counterparty: recipient for sent mail, sender for received mail. */
  address: string;
  subject: string;
  status: "delivered" | "deferred" | "bounced" | "received" | "spam";
  at: string;
};

/**
 * Demo data only.
 *
 * The backend currently exposes SMTP relay config, credentials, servers and
 * sender identity, but no message-history endpoint. To make this tab live,
 * add e.g. GET /api/smtp/messages?direction=sent|received on the API, expose a
 * listSmtpMessages(accessToken, direction) helper in lib/api.ts, then replace
 * MOCK_MESSAGES below with a useEffect that loads from it (mirroring the
 * refresh() pattern used in smtp-tab.tsx).
 */
const MOCK_MESSAGES: EmailMessage[] = [
  { id: "msg_1", direction: "sent", address: "notifications@partner.cd", subject: "Domain verification complete", status: "delivered", at: "2 min ago" },
  { id: "msg_2", direction: "sent", address: "ops@solucien.cd", subject: "Nameserver propagation report", status: "delivered", at: "18 min ago" },
  { id: "msg_3", direction: "sent", address: "billing@client.co.za", subject: "Monthly usage invoice", status: "deferred", at: "1 hr ago" },
  { id: "msg_4", direction: "sent", address: "old-mailbox@test.io", subject: "Welcome to Nani DNS", status: "bounced", at: "3 hr ago" },
  { id: "msg_5", direction: "sent", address: "team@solucien.cd", subject: "Weekly DNS health digest", status: "delivered", at: "yesterday" },
  { id: "msg_6", direction: "received", address: "noreply@registrar.africa", subject: "Renewal confirmation: solucien.cd", status: "received", at: "30 min ago" },
  { id: "msg_7", direction: "received", address: "support@client.co.za", subject: "Re: MX record not resolving", status: "received", at: "2 hr ago" },
  { id: "msg_8", direction: "received", address: "alerts@uptime.io", subject: "Monitor recovered: mail.solucien.cd", status: "received", at: "5 hr ago" },
  { id: "msg_9", direction: "received", address: "promo@bulk-sender.net", subject: "You have won a prize", status: "spam", at: "yesterday" },
];

const STATUS_STYLES: Record<EmailMessage["status"], string> = {
  delivered: "border-emerald-600/40 text-emerald-600",
  received: "border-emerald-600/40 text-emerald-600",
  deferred: "border-amber-600/40 text-amber-600",
  bounced: "border-red-600/40 text-red-600",
  spam: "border-red-600/40 text-red-600",
};

function StatusPill({ status }: { status: EmailMessage["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize",
        STATUS_STYLES[status],
      )}
    >
      {status}
    </span>
  );
}

export function EmailActivityTab() {
  const [direction, setDirection] = useState<Direction>("sent");
  const [query, setQuery] = useState("");

  const counts = useMemo(
    () => ({
      sent: MOCK_MESSAGES.filter((m) => m.direction === "sent").length,
      received: MOCK_MESSAGES.filter((m) => m.direction === "received").length,
    }),
    [],
  );

  const messages = useMemo(() => {
    const term = query.trim().toLowerCase();
    return MOCK_MESSAGES.filter((m) => m.direction === direction).filter((m) =>
      term ? m.address.toLowerCase().includes(term) || m.subject.toLowerCase().includes(term) : true,
    );
  }, [direction, query]);

  const counterpartyHeading = direction === "sent" ? "Recipient" : "Sender";

  return (
    <div className="grid gap-5">
      <div>
        <h3 className="font-semibold">Email activity</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Messages sent and received through the Nani SMTP relay.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2 border-b border-border pb-2 sm:border-0 sm:pb-0">
          {(
            [
              ["sent", "Sent", counts.sent, ArrowUpRight],
              ["received", "Received", counts.received, ArrowDownLeft],
            ] as const
          ).map(([id, label, count, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setDirection(id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition",
                direction === id
                  ? "border-foreground bg-background text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
              <span className="rounded-full bg-panel px-2 text-xs text-muted-foreground">{count}</span>
            </button>
          ))}
        </div>

        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${direction} email`}
            className="pl-9"
          />
        </div>
      </div>

      <p className="rounded-md border border-dashed border-border bg-panel px-3 py-2 text-xs text-muted-foreground">
        Showing demo data. Connect a message-history endpoint on the API to display live email activity.
      </p>

      <section className="overflow-x-auto rounded-md border border-border bg-background">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border text-xs font-bold uppercase tracking-normal text-muted-foreground">
            <tr>
              <th className="px-4 py-3">{counterpartyHeading}</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Time</th>
            </tr>
          </thead>
          <tbody>
            {messages.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No {direction} email matches your search.
                </td>
              </tr>
            ) : (
              messages.map((message) => (
                <tr key={message.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 font-medium">{message.address}</td>
                  <td className="px-4 py-3 text-muted-foreground">{message.subject}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={message.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{message.at}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {messages.length > 0 ? (
        <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <Inbox className="h-3.5 w-3.5" />
          {messages.length} {direction} {messages.length === 1 ? "message" : "messages"}
        </p>
      ) : null}
    </div>
  );
}
