"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Send, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendSms } from "@/lib/api";
import { cn } from "@/lib/utils";

type SendSmsPanelProps = {
  accessToken: string;
};

type FieldErrors = {
  to?: string;
  message?: string;
};

type SentSummary = {
  provider: string;
  status: string;
  messageId: string;
  note?: string;
};

const TO_MAX = 20;
const MESSAGE_MAX = 160;

export function SendSmsPanel({ accessToken }: SendSmsPanelProps) {
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<SentSummary | null>(null);

  const senderHint = useMemo(() => {
    if (!to.trim()) return "Recipient number";
    return to.trim();
  }, [to]);

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    const trimmedTo = to.trim();
    const trimmedMessage = message.trim();

    if (!trimmedTo) next.to = "A recipient number is required.";
    else if (trimmedTo.length < 5 || trimmedTo.length > TO_MAX) {
      next.to = `Enter a valid number between 5 and ${TO_MAX} characters.`;
    }

    if (!trimmedMessage) next.message = "A message is required.";
    else if (trimmedMessage.length > MESSAGE_MAX) {
      next.message = `Keep the message under ${MESSAGE_MAX} characters.`;
    }

    return next;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    setSent(null);

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSending(true);
    try {
      const result = await sendSms(accessToken, {
        to: to.trim(),
        message: message.trim(),
      });
      setSent({
        provider: result.provider,
        status: result.status,
        messageId: result.messageId,
        note: result.note,
      });
      setMessage("");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to send the SMS.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rounded-md border border-border bg-background p-5">
      <div className="flex items-start gap-3">
        <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div>
          <h4 className="font-semibold">Send an SMS</h4>
          <p className="mt-1 text-sm text-muted-foreground">
            Uses the platform SMS endpoint for {senderHint}.
          </p>
        </div>
      </div>

      <form className="mt-4 grid max-w-2xl gap-4" onSubmit={handleSubmit} noValidate>
        <label className="grid gap-2 text-sm font-semibold">
          To
          <Input
            value={to}
            onChange={(event) => setTo(event.target.value)}
            placeholder="27731234567"
            autoComplete="off"
            disabled={sending}
            aria-invalid={Boolean(fieldErrors.to)}
            aria-describedby={fieldErrors.to ? "sms-to-error" : undefined}
          />
          {fieldErrors.to ? (
            <span id="sms-to-error" className="text-xs font-normal text-red-600">
              {fieldErrors.to}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2 text-sm font-semibold">
          Message
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Write your SMS message..."
            rows={5}
            maxLength={MESSAGE_MAX}
            disabled={sending}
            aria-invalid={Boolean(fieldErrors.message)}
            aria-describedby={fieldErrors.message ? "sms-message-error" : undefined}
            className={cn(
              "w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15",
              "disabled:opacity-50",
            )}
          />
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>Up to {MESSAGE_MAX} characters</span>
            <span>{message.length}/{MESSAGE_MAX}</span>
          </div>
          {fieldErrors.message ? (
            <span id="sms-message-error" className="text-xs font-normal text-red-600">
              {fieldErrors.message}
            </span>
          ) : null}
        </label>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={sending}>
            <Send className="h-4 w-4" />
            {sending ? "Sending..." : "Send SMS"}
          </Button>
        </div>
      </form>

      {sent ? (
        <div className="mt-4 flex items-start gap-3 rounded-md border border-emerald-600/40 bg-panel p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">SMS queued</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Provider: {sent.provider} · Status: {sent.status}
            </p>
            {sent.note ? <p className="mt-1 text-sm text-muted-foreground">{sent.note}</p> : null}
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{sent.messageId}</p>
          </div>
        </div>
      ) : null}

      {submitError ? (
        <div className="mt-4 flex items-start gap-3 rounded-md border border-red-600/40 bg-panel p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="text-sm font-semibold">Couldn&apos;t send</p>
            <p className="mt-1 text-sm text-muted-foreground">{submitError}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
