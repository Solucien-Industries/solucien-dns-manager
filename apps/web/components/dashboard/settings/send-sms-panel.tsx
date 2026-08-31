"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, Loader2, Send, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendSms, SmsSendError, type SendSmsResult } from "@/lib/api";
import { cn } from "@/lib/utils";

type SendSmsPanelProps = {
  accessToken: string;
};

type FieldErrors = {
  to?: string;
  message?: string;
};

type HistoryEntry = {
  id: string;
  to: string;
  preview: string;
  provider: string;
  status: string;
  mock: boolean;
  at: number;
};

const MESSAGE_MAX = 160;
const COUNTER_WARN_AT = 140;
const RATE_LIMIT_COOLDOWN_MS = 30_000;
const DRAFT_KEY = "sdm-sms-draft";
const HISTORY_LIMIT = 5;

/** Mirrors the API's normalizer: strip formatting, force a single leading "+". */
function normalizeRecipient(raw: string): string {
  const cleaned = raw.trim().replace(/[\s()\-.]/g, "");
  if (!cleaned) return "";
  return cleaned.startsWith("+") ? cleaned : `+${cleaned.replace(/^\+*/, "")}`;
}

// Matches the server-side rule in sms.dto.ts (after normalization).
const E164 = /^\+[1-9]\d{5,14}$/;

function prettyPhone(e164: string): string {
  // Light grouping for readability only — never sent to the API.
  const digits = e164.replace(/^\+/, "");
  if (digits.length <= 6) return e164;
  return `+${digits.slice(0, digits.length - 9)} ${digits.slice(-9, -6)} ${digits.slice(-6, -3)} ${digits.slice(-3)}`.replace(
    /\s+/g,
    " ",
  );
}

function friendlyError(error: unknown): string {
  if (error instanceof SmsSendError) {
    switch (error.kind) {
      case "rate-limit":
        return "You're sending too quickly. Wait a moment and try again.";
      case "quota":
        return "This workspace has reached its monthly SMS limit.";
      case "provider":
        return "The SMS gateway rejected the request. Check the number and provider settings, then retry.";
      case "network":
        return error.message;
      case "validation":
        return error.message;
      default:
        return error.message || "Failed to send the SMS.";
    }
  }
  return error instanceof Error ? error.message : "Failed to send the SMS.";
}

export function SendSmsPanel({ accessToken }: SendSmsPanelProps) {
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<SendSmsResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const draftLoaded = useRef(false);

  // Restore an unsent draft so navigating away mid-message doesn't lose it.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as { to?: unknown; message?: unknown };
        // One-time hydration from storage on mount — not a render-loop trigger.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (typeof draft.to === "string") setTo(draft.to);
        if (typeof draft.message === "string") setMessage(draft.message);
      }
    } catch {
      /* ignore malformed / unavailable storage */
    } finally {
      draftLoaded.current = true;
    }
  }, []);

  useEffect(() => {
    if (!draftLoaded.current) return;
    try {
      if (!to && !message) window.localStorage.removeItem(DRAFT_KEY);
      else window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ to, message }));
    } catch {
      /* ignore */
    }
  }, [to, message]);

  // Drive the rate-limit countdown.
  useEffect(() => {
    if (cooldownUntil <= now) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [cooldownUntil, now]);

  const normalizedTo = useMemo(() => normalizeRecipient(to), [to]);
  const cooldownRemaining = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  function computeErrors(): FieldErrors {
    const next: FieldErrors = {};
    if (!to.trim()) next.to = "A recipient number is required.";
    else if (!E164.test(normalizedTo)) next.to = "Enter a valid international number, e.g. +27731234567.";

    const trimmed = message.trim();
    if (!trimmed) next.message = "A message is required.";
    else if (trimmed.length > MESSAGE_MAX) next.message = `Keep the message under ${MESSAGE_MAX} characters.`;
    return next;
  }

  const isValid = useMemo(
    () => Object.keys(computeErrors()).length === 0,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [to, message, normalizedTo],
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    setSent(null);
    setCopied(false);

    const errors = computeErrors();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      if (errors.to) toRef.current?.focus();
      else messageRef.current?.focus();
      return;
    }

    setSending(true);
    try {
      const result = await sendSms(accessToken, { to: normalizedTo, message: message.trim() });
      const mock = result.provider === "mock" || Boolean(result.note);
      setSent(result);
      setHistory((prev) =>
        [
          {
            id: result.messageId,
            to: result.to,
            preview: message.trim().slice(0, 60),
            provider: result.provider,
            status: result.status,
            mock,
            at: Date.now(),
          },
          ...prev,
        ].slice(0, HISTORY_LIMIT),
      );
      setMessage("");
      setFieldErrors({});
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (error) {
      setSubmitError(friendlyError(error));
      if (error instanceof SmsSendError && error.kind === "rate-limit") {
        setCooldownUntil(Date.now() + RATE_LIMIT_COOLDOWN_MS);
        setNow(Date.now());
      }
      requestAnimationFrame(() => resultRef.current?.focus());
    } finally {
      setSending(false);
    }
  }

  function handleMessageKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  async function copyMessageId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  const disabled = sending || cooldownRemaining > 0;
  const counterTone =
    message.length >= MESSAGE_MAX
      ? "text-red-600"
      : message.length >= COUNTER_WARN_AT
        ? "text-amber-600"
        : "text-muted-foreground";

  return (
    <section className="rounded-md border border-border bg-background p-5">
      <div className="flex items-start gap-3">
        <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div>
          <h4 className="font-semibold">Send an SMS</h4>
          <p className="mt-1 text-sm text-muted-foreground">
            One message, up to {MESSAGE_MAX} characters, through the platform SMS gateway.
          </p>
        </div>
      </div>

      <form ref={formRef} className="mt-4 grid max-w-2xl gap-4" onSubmit={handleSubmit} noValidate>
        <label className="grid gap-2 text-sm font-semibold">
          To
          <Input
            ref={toRef}
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              if (fieldErrors.to) setFieldErrors((prev) => ({ ...prev, to: undefined }));
            }}
            onBlur={() => {
              const next = computeErrors();
              setFieldErrors((prev) => ({ ...prev, to: next.to }));
            }}
            placeholder="+27731234567"
            inputMode="tel"
            autoComplete="off"
            disabled={sending}
            aria-invalid={Boolean(fieldErrors.to)}
            aria-describedby={fieldErrors.to ? "sms-to-error" : "sms-to-hint"}
          />
          {fieldErrors.to ? (
            <span id="sms-to-error" className="text-xs font-normal text-red-600">
              {fieldErrors.to}
            </span>
          ) : (
            <span id="sms-to-hint" className="text-xs font-normal text-muted-foreground">
              {E164.test(normalizedTo) ? `Will send to ${prettyPhone(normalizedTo)}` : "International format, digits only."}
            </span>
          )}
        </label>

        <label className="grid gap-2 text-sm font-semibold">
          Message
          <textarea
            ref={messageRef}
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              if (fieldErrors.message) setFieldErrors((prev) => ({ ...prev, message: undefined }));
            }}
            onKeyDown={handleMessageKeyDown}
            placeholder="Write your SMS message..."
            rows={5}
            maxLength={MESSAGE_MAX}
            disabled={sending}
            aria-invalid={Boolean(fieldErrors.message)}
            aria-describedby={fieldErrors.message ? "sms-message-error" : "sms-message-hint"}
            className={cn(
              "w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15",
              "disabled:opacity-50",
            )}
          />
          <div id="sms-message-hint" className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{"⌘"}/Ctrl + Enter to send</span>
            <span className={counterTone}>
              {message.length}/{MESSAGE_MAX}
            </span>
          </div>
          {fieldErrors.message ? (
            <span id="sms-message-error" className="text-xs font-normal text-red-600">
              {fieldErrors.message}
            </span>
          ) : null}
        </label>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={disabled || !isValid}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Sending..." : cooldownRemaining > 0 ? `Retry in ${cooldownRemaining}s` : "Send SMS"}
          </Button>
        </div>
      </form>

      <div ref={resultRef} tabIndex={-1} aria-live="polite" className="outline-none">
        {sent ? (
          <div className="mt-4 flex items-start gap-3 rounded-md border border-emerald-600/40 bg-panel p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-semibold">
                SMS {sent.status}
                {(sent.provider === "mock" || sent.note) && (
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
                    Test mode — not delivered
                  </span>
                )}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {prettyPhone(sent.to)} · via {sent.provider}
              </p>
              {sent.note ? <p className="mt-1 text-sm text-muted-foreground">{sent.note}</p> : null}
              <div className="mt-2 flex items-center gap-2">
                <code className="truncate rounded bg-background px-2 py-1 font-mono text-xs text-muted-foreground">
                  {sent.messageId}
                </code>
                <button
                  type="button"
                  onClick={() => void copyMessageId(sent.messageId)}
                  className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-semibold transition hover:bg-muted"
                >
                  <Copy className="h-3 w-3" />
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
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
      </div>

      {history.length > 0 ? (
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-xs font-bold uppercase tracking-normal text-muted-foreground">This session</p>
          <ul className="mt-2 grid gap-2">
            {history.map((entry) => (
              <li key={`${entry.id}-${entry.at}`} className="flex items-start gap-3 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <div className="min-w-0">
                  <p className="font-semibold">
                    {prettyPhone(entry.to)}
                    {entry.mock ? <span className="ml-2 text-xs font-normal text-amber-700">test</span> : null}
                  </p>
                  <p className="truncate text-muted-foreground">{entry.preview || "(no preview)"}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
