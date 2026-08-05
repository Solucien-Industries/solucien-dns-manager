export type DomainStatus = "Active" | "Pending" | "Attention";
export type RecordType = "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS";
export declare const RECORD_TYPES: RecordType[];
export declare const NANI_NAMESERVERS: [string, string];
export declare const SOLUCIEN_NAMESERVERS: [string, string];
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
export type DashboardStats = {
    activeDomains: number;
    managedRecords: number;
    nameservers: number;
    attentionItems: number;
};
export type DashboardData = {
    domains: Domain[];
    records: DnsRecord[];
    stats: DashboardStats;
};
export declare const seedDomains: Domain[];
export declare const seedRecords: DnsRecord[];
export declare function computeStats(domains: Domain[]): DashboardStats;
export declare function seedDashboard(): DashboardData;
export declare const workflow: string[];
