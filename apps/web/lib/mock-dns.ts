export type DomainStatus = "Active" | "Pending" | "Attention";
export type RecordType = "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS";

export type Domain = {
  id: string;
  name: string;
  tld: string;
  status: DomainStatus;
  zone: string;
  owner: string;
  nameservers: [string, string];
  records: number;
  uptime: string;
  lastSync: string;
};

export type DnsRecord = {
  id: string;
  domain: string;
  type: RecordType;
  name: string;
  value: string;
  ttl: number;
  priority?: number;
  updatedAt: string;
};

export const domains: Domain[] = [
  {
    id: "dom_001",
    name: "solucien.cd",
    tld: ".cd",
    status: "Active",
    zone: "solucien.cd.",
    owner: "Solucien Industries",
    nameservers: ["ns1.nani.dns", "ns2.nani.dns"],
    records: 18,
    uptime: "99.99%",
    lastSync: "2 min ago",
  },
  {
    id: "dom_002",
    name: "kinshasa.africa",
    tld: ".africa",
    status: "Active",
    zone: "kinshasa.africa.",
    owner: "Regional Growth Team",
    nameservers: ["ns1.nani.dns", "ns2.nani.dns"],
    records: 12,
    uptime: "99.96%",
    lastSync: "9 min ago",
  },
  {
    id: "dom_003",
    name: "lakehub.ke",
    tld: ".ke",
    status: "Pending",
    zone: "lakehub.ke.",
    owner: "LakeHub Labs",
    nameservers: ["ns1.nani.dns", "ns2.nani.dns"],
    records: 7,
    uptime: "Pending",
    lastSync: "Queued",
  },
  {
    id: "dom_004",
    name: "commerce.co.za",
    tld: ".co.za",
    status: "Attention",
    zone: "commerce.co.za.",
    owner: "Commerce Desk",
    nameservers: ["ns1.nani.dns", "ns2.nani.dns"],
    records: 21,
    uptime: "98.72%",
    lastSync: "38 min ago",
  },
];

export const dnsRecords: DnsRecord[] = [
  {
    id: "rec_001",
    domain: "solucien.cd",
    type: "A",
    name: "@",
    value: "196.29.43.18",
    ttl: 300,
    updatedAt: "2 min ago",
  },
  {
    id: "rec_002",
    domain: "solucien.cd",
    type: "MX",
    name: "@",
    value: "mail.solucien.cd",
    ttl: 3600,
    priority: 10,
    updatedAt: "14 min ago",
  },
  {
    id: "rec_003",
    domain: "kinshasa.africa",
    type: "TXT",
    name: "_spf",
    value: "v=spf1 include:nani.dns -all",
    ttl: 1800,
    updatedAt: "24 min ago",
  },
  {
    id: "rec_004",
    domain: "lakehub.ke",
    type: "CNAME",
    name: "www",
    value: "lakehub.ke",
    ttl: 600,
    updatedAt: "Queued",
  },
  {
    id: "rec_005",
    domain: "commerce.co.za",
    type: "A",
    name: "api",
    value: "102.214.71.10",
    ttl: 300,
    updatedAt: "38 min ago",
  },
];

export const workflow = [
  "Create an account and add a domain, including African ccTLDs like .cd, .ke, .co.za, and .africa.",
  "Nani creates a PowerDNS zone and assigns ns1.nani.dns plus ns2.nani.dns.",
  "Manage A, AAAA, CNAME, MX, TXT, and NS records from one dashboard while the API syncs changes to PowerDNS.",
  "Monitor health, TTLs, pending changes, and enterprise readiness as the platform grows toward registrar services.",
];
