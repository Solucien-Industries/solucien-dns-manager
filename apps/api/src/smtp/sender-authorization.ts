import type { DomainOperationalStatus, SendingVerificationStatus } from "@prisma/client";

export type SenderDomainRecord = {
  id: string;
  tenantId: string;
  sendingVerification: SendingVerificationStatus;
  operationalStatus: DomainOperationalStatus;
};

export function parseSenderDomain(from: string): string | null {
  const match = from.trim().match(/^(?:[^<>]*<)?[^@<>\s]+@([^@<>\s]+)>?$/);
  return match?.[1]?.toLowerCase().replace(/\.$/, "") ?? null;
}

export function senderDomainRejection(domain: SenderDomainRecord | null, tenantId: string): string | null {
  if (!domain || domain.tenantId !== tenantId) return "Sender domain is not authorised for this workspace.";
  if (domain.sendingVerification !== "VERIFIED") return "Sender domain is not verified.";
  if (domain.operationalStatus !== "ACTIVE") return "Sender domain is suspended or disabled.";
  return null;
}
