import { Injectable, Logger } from "@nestjs/common";
import type { RecordType } from "@solucien/shared";

/** Shapes returned by the PowerDNS Authoritative HTTP API (subset we use). */
export interface PdnsZone {
  id: string;
  name: string;
  kind: string;
  serial: number;
  dnssec: boolean;
}

export interface PdnsRRSet {
  name: string;
  type: string;
  ttl: number;
  records: { content: string; disabled: boolean }[];
}

/**
 * Client for the PowerDNS Authoritative REST API.
 * Docs: https://doc.powerdns.com/authoritative/http-api/
 *
 * Every method is defensive: if PowerDNS is unreachable or unconfigured it throws
 * a typed error that callers convert into a graceful fallback.
 */
@Injectable()
export class PowerDnsService {
  private readonly logger = new Logger(PowerDnsService.name);
  private readonly baseUrl = process.env.PDNS_API_URL ?? "http://localhost:8081";
  private readonly serverId = process.env.PDNS_SERVER_ID ?? "localhost";
  private readonly apiKey = process.env.PDNS_API_KEY ?? "";

  get configured(): boolean {
    return Boolean(this.apiKey);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
      ...init,
      headers: {
        "X-API-Key": this.apiKey,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`PowerDNS ${res.status} ${res.statusText}: ${body}`);
    }
    // PATCH/DELETE may return empty bodies.
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /** Ensure a zone name ends with a trailing dot (PowerDNS canonical form). */
  canonical(zone: string): string {
    return zone.endsWith(".") ? zone : `${zone}.`;
  }

  async listZones(): Promise<PdnsZone[]> {
    return this.request<PdnsZone[]>(`/servers/${this.serverId}/zones`);
  }

  async getZone(zone: string): Promise<PdnsZone & { rrsets: PdnsRRSet[] }> {
    return this.request(`/servers/${this.serverId}/zones/${this.canonical(zone)}`);
  }

  /** Create an authoritative zone with the Solucien nameservers. */
  async createZone(zone: string, nameservers: string[]): Promise<PdnsZone> {
    return this.request<PdnsZone>(`/servers/${this.serverId}/zones`, {
      method: "POST",
      body: JSON.stringify({
        name: this.canonical(zone),
        kind: "Native",
        nameservers: nameservers.map((ns) => this.canonical(ns)),
      }),
    });
  }

  async deleteZone(zone: string): Promise<void> {
    await this.request(`/servers/${this.serverId}/zones/${this.canonical(zone)}`, {
      method: "DELETE",
    });
  }

  /**
   * Upsert a single record via an RRSet PATCH. PowerDNS replaces the whole RRSet,
   * so callers should pass every record that should exist for (name, type).
   */
  async upsertRecord(
    zone: string,
    name: string,
    type: RecordType,
    contents: string[],
    ttl: number,
  ): Promise<void> {
    const fqdn = name === "@" ? this.canonical(zone) : this.canonical(`${name}.${zone}`);
    await this.request(`/servers/${this.serverId}/zones/${this.canonical(zone)}`, {
      method: "PATCH",
      body: JSON.stringify({
        rrsets: [
          {
            name: fqdn,
            type,
            ttl,
            changetype: "REPLACE",
            records: contents.map((content) => ({ content, disabled: false })),
          },
        ],
      }),
    });
  }

  async deleteRecord(zone: string, name: string, type: RecordType): Promise<void> {
    const fqdn = name === "@" ? this.canonical(zone) : this.canonical(`${name}.${zone}`);
    await this.request(`/servers/${this.serverId}/zones/${this.canonical(zone)}`, {
      method: "PATCH",
      body: JSON.stringify({
        rrsets: [{ name: fqdn, type, changetype: "DELETE" }],
      }),
    });
  }
}
