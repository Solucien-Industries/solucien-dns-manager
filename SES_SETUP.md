# Live email sending via AWS SES — setup notes

The API can now send real email through AWS SES over SMTP. The **code** is done;
the steps below are the **AWS + DNS setup** that has to happen for mail to
actually deliver. Code changes are marked DONE; the rest is account/infra work.

## What the code does (DONE)

- `apps/api/src/smtp/mail.service.ts` — Nodemailer transport pointed at SES's
  SMTP endpoint, configured entirely from env vars. Fails with a clear 503 if
  it isn't configured (never silently pretends to send).
- `POST /api/smtp/send` — authenticated endpoint. Uses the workspace's saved
  sender identity as the From address (or an explicit `fromEmail` in the body).
- `GET /api/smtp` now also returns `sendingConfigured: true|false` so the UI can
  show whether live sending is switched on.

Request body for `POST /api/smtp/send`:

    {
      "to": "customer@example.com",
      "subject": "Your DNS zone is ready",
      "text": "Plain text body",
      "html": "<p>HTML body</p>",        // text and/or html
      "replyTo": "support@solucien.cd"    // optional
    }

## AWS setup (has to be done in the AWS console — not in code)

1. **Pick a region** and use it consistently. The SMTP host is region-specific,
   e.g. `email-smtp.eu-west-1.amazonaws.com`.
2. **Verify the sending domain** in SES (e.g. `solucien.cd`). SES gives you a set
   of **DKIM CNAME records** — add them to the domain's DNS zone.
3. **Add SPF and DMARC** records for the domain:
   - SPF (TXT on the domain root): `v=spf1 include:amazonses.com ~all`
   - DMARC (TXT on `_dmarc`): start with `v=DMARC1; p=none; rua=mailto:dmarc@solucien.cd`
4. **Create SES *SMTP* credentials** (SES console → SMTP settings → Create SMTP
   credentials). This produces an SMTP username + password. **These are not your
   AWS access keys** — they're SES-specific.
5. **Request production access** (move out of the SES sandbox). In the sandbox
   SES only sends to verified addresses. Production access is a short AWS request
   form and can take a little time to approve — start this early.

## Env vars (add to `apps/api/.env`, and document in `.env.example`)

    # --- AWS SES (transactional email sending) ---
    SES_SMTP_HOST=email-smtp.eu-west-1.amazonaws.com   # your region's endpoint
    SES_SMTP_PORT=587                                  # 587 STARTTLS (or 465 TLS)
    SES_SMTP_USERNAME=                                 # SES SMTP username
    SES_SMTP_PASSWORD=                                 # SES SMTP password

The From address you send with (the saved sender identity, e.g.
`notifications@solucien.cd`) **must be on a domain verified in SES**, or SES will
reject it.

## How to verify it works

1. Fill in the four `SES_SMTP_*` vars and restart the API.
2. Save a sender identity on a verified domain (SMTP settings → Default sender).
3. `POST /api/smtp/send` (via Swagger at `/api/docs`) to an address you control.
4. While still in the SES sandbox, the recipient must also be a verified address.

## Notes / follow-ups

- **Persistence:** SMTP credentials and sender identity are still stored in
  memory in `smtp.service.ts` (wiped on restart). Fine for now; before heavy
  production use they should move to the database (Prisma).
- **Email activity tab:** the frontend "Email" tab still shows demo data. Once
  sending is live, a logging table + `GET /api/smtp/messages` endpoint would let
  it show real sent history. Send results (`messageId`, accepted/rejected) are
  already returned by `POST /api/smtp/send`, so they're ready to be recorded.
- **Customer-facing relay:** this makes *the application* send via SES. If Nani
  is also meant to expose `smtp.nani.dns` as a relay customers point their own
  apps at, that's a separate piece of infrastructure (running/hosting a relay).
