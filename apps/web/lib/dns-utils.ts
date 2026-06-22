export const PLATFORM_NAMESERVERS = ["ns1.nani.dns", "ns2.nani.dns"] as const;

export function isValidDomainName(value: string): boolean {
  return /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(value.trim());
}

export function normalizeDomainName(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
}
