# SMTP / Email DNS Support

Nani DNS does not run an SMTP server inside the DNS control plane. Email delivery is handled by the **Nani SMTP relay** (`smtp.nani.dns`), while **DNS records** configure how domains send, receive, and authenticate mail.

## Platform SMTP relay

- Host: `smtp.nani.dns`
- Port 587: STARTTLS (recommended)
- Port 465: Implicit SSL/TLS
- Username: `nani`
- Password: workspace credential from the console

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