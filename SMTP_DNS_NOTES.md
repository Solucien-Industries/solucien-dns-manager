# SMTP / Email DNS Support

Nani DNS currently submits authenticated REST requests through the platform AWS SES account. A customer-facing SMTP relay at `smtp.nani.dns` is a separate deployment requirement; it is not implemented by this NestJS API.

## Platform SMTP relay

- Host: `smtp.nani.dns`
- Port 587: STARTTLS (recommended)
- Port 465: Implicit SSL/TLS
- Nani-generated usernames/passwords are stored application credentials for a future Nani relay. They cannot authenticate directly to the AWS SES endpoint.
- AWS SES uses the platform-only `SES_SMTP_USERNAME` and `SES_SMTP_PASSWORD` values.

## Supported email DNS records

The API validates MX, SPF, DKIM, and DMARC records when creating DNS entries.

### MX

MX records tell the internet where email for a domain should be delivered.

```txt
@ MX 10 mail.example.com
```

Rules enforced by the API:

- Priority is required
- Target must be a hostname (not an IP address)

### SPF (TXT)

```txt
@ TXT "v=spf1 include:nani.dns -all"
```

### DKIM (TXT)

```txt
default._domainkey TXT "v=DKIM1; k=rsa; p=..."
```

DKIM TXT values must start with `v=DKIM1`.

### DMARC (TXT)

```txt
_dmarc TXT "v=DMARC1; p=none; rua=mailto:dmarc@example.com"
```

DMARC TXT values must start with `v=DMARC1`.

See `apps/api/src/records/records.service.ts` for validation logic merged from `feat/smtp-dns-record-validation`.

## SES authentication guidance

SES Easy DKIM CNAME records are persisted as required sending records. SPF is guidance-only because publishing a second SPF TXT policy is invalid: merge `include:amazonses.com` into the domain's existing single SPF policy, or create `v=spf1 include:amazonses.com ~all` only if no SPF policy exists. DMARC is recommended at `_dmarc` with an initial `p=none` policy and a reporting mailbox controlled by the customer; it does not block verification.

Custom MAIL FROM/return-path is not automated. Configure a dedicated MAIL FROM subdomain in SES, then publish the exact region-specific MX and SPF records returned by SES. Do not invent or reuse apex values.

## Queue and events

PostgreSQL stores message metadata and the temporary queue payload. Workers claim records atomically. Safe pre-transaction connection/DNS failures retry at most three times with exponential backoff; ambiguous SMTP failures and claims stale for ten minutes fail terminally rather than risk duplicate delivery. Temporary bodies are excluded from log APIs and removed after terminal provider submission.

`POST /api/messages/events/ses` accepts a direct SES event object or an SNS notification envelope whose `Message` contains JSON-encoded SES event data. An authenticated adapter must add `x-nani-webhook-secret`; native SNS cannot add that header. The endpoint rejects malformed or payloads larger than 100 KiB and deduplicates notifications using a database unique provider-event ID.
