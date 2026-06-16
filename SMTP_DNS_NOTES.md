# SMTP / Email DNS Support

This project does not configure or run an SMTP server directly.

For the Solucien DNS Manager, SMTP/email support is handled through DNS records that allow domains to receive mail, authorise senders, verify signed messages, and publish mail policy.

## Supported email DNS records

### MX

MX records tell the internet where email for a domain should be delivered.

Example:

```txt
@ MX 10 mail.solucien.cd