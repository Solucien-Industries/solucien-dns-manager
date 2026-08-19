"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendEmail, type SmtpConfig } from "@/lib/api";
import { cn } from "@/lib/utils";

type SendEmailPanelProps = {
  accessToken: string;
  sender: SmtpConfig["sender"];
  /** True when the platform SES relay is configured (GET /api/smtp -> sendingConfigured). */
  sendingConfigured: boolean;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUBJECT_MAX = 200;
const BODY_MAX = 100_000;

type FieldErrors = {
  to?: string;
  subject?: string;
  body?: string;
};

type SentSummary = {
  messageId: string;
  accepted: string[];
};

export function SendEmailPanel({ accessToken, sender, sendingConfigured }: SendEmailPanelProps) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<SentSummary | null>(null);

  const senderConfigured = sender.fromEmail.trim().length > 0;
  const canSend = sendingConfigured && senderConfigured && !sending;

  const senderLabel = useMemo(
    () => (sender.fromName ? `${sender.fromName} <${sender.fromEmail}>` : sender.fromEmail),
    [sender.fromEmail, sender.fromName],
  );

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    const trimmedTo = to.trim();
    if (!trimmedTo) next.to = "A recipient is required.";
    else if (!EMAIL_PATTERN.test(trimmedTo)) next.to = "Enter a valid email address.";

    if (!subject.trim()) next.subject = "A subject is required.";
    else if (subject.length > SUBJECT_MAX) next.subject = `Keep the subject under ${SUBJECT_MAX} characters.`;

    if (!body.trim()) next.body = "A message is required.";
    else if (body.length > BODY_MAX) next.body = "This message is too long.";

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
      const result = await sendEmail(accessToken, {
        to: to.trim(),
        subject: subject.trim(),
        text: body,
      });
      setSent({ messageId: result.messageId, accepted: result.accepted });
      // Clear the composed message; keep the recipient for quick follow-ups.
      setSubject("");
      setBody("");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to send the email.");
    } finally {
      setSending(false);
    }
  }

  if (!sendingConfigured) {
    return (
      <section className="rounded-md border border-border bg-background p-5">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <h4 className="font-semibold">Sending isn&apos;t configured yet</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              The platform email relay isn&apos;t connected, so messages can&apos;t be sent. Once the
              relay credentials are configured on the server, this form will be enabled.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-border bg-background p-5">
      <div>
        <h4 className="font-semibold">Send an email</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Sends through the platform relay from{" "}
          {senderConfigured ? (
            <span className="font-medium text-foreground">{senderLabel}</span>
          ) : (
            "your default sender"
          )}
          .
        </p>
      </div>

      {!senderConfigured ? (
        <div className="mt-4 flex items-start gap-3 rounded-md border border-amber-600/40 bg-panel p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-sm text-muted-foreground">
            Set a default sender identity under{" "}
            <span className="font-medium text-foreground">Connection &amp; credentials</span> before
            sending.
          </p>
        </div>
      ) : null}

      <form className="mt-4 grid max-w-2xl gap-4" onSubmit={handleSubmit} noValidate>
        <label className="grid gap-2 text-sm font-semibold">
          To
          <Input
            type="email"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            placeholder="recipient@example.com"
            autoComplete="off"
            disabled={sending}
            aria-invalid={Boolean(fieldErrors.to)}
            aria-describedby={fieldErrors.to ? "send-to-error" : undefined}
          />
          {fieldErrors.to ? (
            <span id="send-to-error" className="text-xs font-normal text-red-600">
              {fieldErrors.to}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2 text-sm font-semibold">
          Subject
          <Input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Subject line"
            maxLength={SUBJECT_MAX}
            disabled={sending}
            aria-invalid={Boolean(fieldErrors.subject)}
            aria-describedby={fieldErrors.subject ? "send-subject-error" : undefined}
          />
          {fieldErrors.subject ? (
            <span id="send-subject-error" className="text-xs font-normal text-red-600">
              {fieldErrors.subject}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2 text-sm font-semibold">
          Message
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write your message..."
            rows={8}
            disabled={sending}
            aria-invalid={Boolean(fieldErrors.body)}
            aria-describedby={fieldErrors.body ? "send-body-error" : undefined}
            className={cn(
              "w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15",
              "disabled:opacity-50",
            )}
          />
          {fieldErrors.body ? (
            <span id="send-body-error" className="text-xs font-normal text-red-600">
              {fieldErrors.body}
            </span>
          ) : null}
        </label>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!canSend}>
            <Send className="h-4 w-4" />
            {sending ? "Sending..." : "Send email"}
          </Button>
        </div>
      </form>

      {sent ? (
        <div className="mt-4 flex items-start gap-3 rounded-md border border-emerald-600/40 bg-panel p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Email queued</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Accepted for asynchronous delivery to {sent.accepted.length > 0 ? sent.accepted.join(", ") : "the recipient"}.
            </p>
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
